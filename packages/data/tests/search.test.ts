import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { backfillSearchIndex, parseVerseRef, searchVerses, search } from '../src/queries/search.js';
import type { Client } from '@libsql/client';

async function seed(db: Client): Promise<void> {
  await db.execute("INSERT INTO surahs VALUES (1,'الفاتحة','Al-Fatiha','The Opener','meccan',7,1)");
  await db.execute(
    "INSERT INTO ayahs (id,surah_id,ayah_number,text_uthmani) VALUES (1,1,1,'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ')",
  );
  await db.execute("INSERT INTO languages VALUES ('en','English','English','ltr')");
  await db.execute("INSERT INTO languages VALUES ('uz','Uzbek','Ўзбек','ltr')");
  await db.execute(
    "INSERT INTO translations (ayah_id,language_code,translator,text) VALUES (1,'en','T','In the name of Allah')",
  );
  await db.execute(
    "INSERT INTO translations (ayah_id,language_code,translator,text) VALUES (1,'uz','T','Аллоҳнинг номи билан')",
  );
}

let db: Client;
beforeEach(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await seed(db);
});

describe('backfillSearchIndex', () => {
  it('indexes normalized Arabic and is queryable harakat-free', async () => {
    await backfillSearchIndex(db);
    const hit = await db.execute("SELECT source FROM search_fts WHERE search_fts MATCH 'الرحمن'");
    expect(hit.rows).toHaveLength(1);
    expect(hit.rows[0]!['source']).toBe('ar');
  });
  it('does not duplicate translation rows already synced by trigger', async () => {
    await backfillSearchIndex(db);
    const c = await db.execute("SELECT count(*) c FROM search_fts WHERE source='en'");
    expect(c.rows[0]!['c']).toBe(1);
  });
  it('is idempotent', async () => {
    await backfillSearchIndex(db);
    await backfillSearchIndex(db);
    const c = await db.execute('SELECT count(*) c FROM search_fts');
    expect(c.rows[0]!['c']).toBe(3); // 1 ar + 1 en + 1 uz
  });
});

describe('parseVerseRef', () => {
  it('parses S:A:W', async () => {
    expect(await parseVerseRef(db, '1:1:2')).toEqual({ surah: 1, ayah: 1, position: 2 });
  });
  it('parses S:A', async () => {
    expect(await parseVerseRef(db, '2:255')).toEqual({ surah: 2, ayah: 255, position: null });
  });
  it('parses surah-only', async () => {
    expect(await parseVerseRef(db, '1')).toEqual({ surah: 1, ayah: null, position: null });
  });
  it('rejects out-of-range surah', async () => {
    expect(await parseVerseRef(db, '200:1')).toBeNull();
  });
  it('resolves a translit surah name + ayah', async () => {
    expect(await parseVerseRef(db, 'Al-Fatiha 1')).toEqual({ surah: 1, ayah: 1, position: null });
  });
  it('resolves an English surah name', async () => {
    expect(await parseVerseRef(db, 'the opener')).toEqual({ surah: 1, ayah: null, position: null });
  });
  it('returns null for free-text', async () => {
    expect(await parseVerseRef(db, 'mercy of god')).toBeNull();
  });
});

describe('searchVerses', () => {
  it('matches Arabic harakat-free with a sentinel-marked snippet', async () => {
    await backfillSearchIndex(db);
    const hits = await searchVerses(db, 'الرحمن');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.source).toBe('ar');
    expect(hits[0]!.snippet).toContain('\u0002'); // open sentinel present
  });
  it('matches translation text', async () => {
    await backfillSearchIndex(db);
    const hits = await searchVerses(db, 'name');
    expect(hits.some((h) => h.source === 'en')).toBe(true);
  });
  it('neutralizes FTS operator injection (no throw, no match)', async () => {
    await backfillSearchIndex(db);
    const hits = await searchVerses(db, 'zzz* OR 1');
    expect(hits).toEqual([]);
  });
  it('returns [] for empty query', async () => {
    await backfillSearchIndex(db);
    expect(await searchVerses(db, '   ')).toEqual([]);
  });
  it('matches Uzbek Cyrillic translations from a Latin-typed query', async () => {
    await backfillSearchIndex(db);
    const hits = await searchVerses(db, 'bilan');
    expect(hits.some((h) => h.source === 'uz')).toBe(true);
  });
  it('does not run the Uzbek fallback for an Arabic query', async () => {
    await backfillSearchIndex(db);
    const hits = await searchVerses(db, 'الرحمن');
    expect(hits.some((h) => h.source === 'uz')).toBe(false);
  });
});

describe('search orchestrator', () => {
  it('returns a jump verse with words for a verse ref', async () => {
    await backfillSearchIndex(db);
    const res = await search(db, '1:1');
    expect(res.jump).not.toBeNull();
    expect(res.jump!.surah_id).toBe(1);
    expect(res.jump!.ayah_number).toBe(1);
    expect(res.jump!.highlightPosition).toBeNull();
    expect(res.jump!.text_uthmani).toContain('بِسْمِ');
  });
  it('sets highlightPosition for a word ref', async () => {
    await backfillSearchIndex(db);
    const res = await search(db, '1:1:1');
    expect(res.jump!.highlightPosition).toBe(1);
  });
  it('gives a surah-level jump (null ayah) for a bare surah', async () => {
    const res = await search(db, '1');
    expect(res.jump).not.toBeNull();
    expect(res.jump!.ayah_number).toBeNull();
    expect(res.jump!.words).toEqual([]);
  });
  it('returns verses + roots and no jump for free-text', async () => {
    await backfillSearchIndex(db);
    const res = await search(db, 'name');
    expect(res.jump).toBeNull();
    expect(res.verses.length).toBeGreaterThan(0);
    expect(Array.isArray(res.roots)).toBe(true);
  });
  it('returns an empty shape for a blank query', async () => {
    expect(await search(db, '  ')).toEqual({ jump: null, verses: [], roots: [] });
  });
});
