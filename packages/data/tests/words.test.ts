import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import {
  getWordsByAyah,
  getWordsBySurah,
  getWordsBySurahAyahRange,
  getWordByLocation,
  getWordDetail,
} from '../src/queries/words.js';

let db: Client;
let ayahId: number;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);

  await db.execute({
    sql: `INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
          VALUES (1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 'meccan', 7, 1)`,
    args: [],
  });

  const r = await db.execute({
    sql: `INSERT INTO ayahs (surah_id, ayah_number, text_uthmani)
          VALUES (1, 1, 'بِسْمِ ٱللَّهِ') RETURNING id`,
    args: [],
  });
  ayahId = r.rows[0]?.['id'] as number;

  await db.execute({
    sql: `INSERT INTO words (ayah_id, position, text_arabic, transliteration, root, pos_tag)
          VALUES (?, 1, 'بِسْمِ', 'bismi', 'س م و', 'P'),
                 (?, 2, 'ٱللَّهِ', 'l-lahi', NULL, 'PN'),
                 (?, 3, 'ٱلرَّحْمَـٰنِ', 'l-rahmani', 'ر ح م', 'ADJ')`,
    args: [ayahId, ayahId, ayahId],
  });
});

afterAll(() => db.close());

describe('getWordsByAyah', () => {
  it('returns all words for an ayah', async () => {
    const words = await getWordsByAyah(db, ayahId);
    expect(words).toHaveLength(3);
  });

  it('returns words ordered by position', async () => {
    const words = await getWordsByAyah(db, ayahId);
    expect(words.map((w) => w.position)).toEqual([1, 2, 3]);
  });

  it('returns empty array for unknown ayah', async () => {
    const words = await getWordsByAyah(db, 999);
    expect(words).toHaveLength(0);
  });

  it('maps morphology_description, grammar_arabic, audio_url', async () => {
    await db.execute(
      `UPDATE words SET morphology_description='desc', grammar_arabic='جار ومجرور' WHERE position=1 AND ayah_id=${ayahId}`,
    );
    const words = await getWordsByAyah(db, ayahId);
    const w = words.find((x) => x.position === 1)!;
    expect(w.morphology_description).toBe('desc');
    expect(w.grammar_arabic).toBe('جار ومجرور');
    expect(w.audio_url).toBeNull();
  });
});

describe('getWordsBySurah', () => {
  it('returns all words for all ayahs in a surah', async () => {
    const words = await getWordsBySurah(db, 1);
    expect(words).toHaveLength(3);
  });

  it('returns words ordered by ayah then position', async () => {
    const words = await getWordsBySurah(db, 1);
    expect(words.map((w) => w.position)).toEqual([1, 2, 3]);
  });

  it('returns empty array for unknown surah', async () => {
    const words = await getWordsBySurah(db, 999);
    expect(words).toHaveLength(0);
  });

  it('returned words include ayah_id', async () => {
    const words = await getWordsBySurah(db, 1);
    expect(words[0]?.ayah_id).toBe(ayahId);
  });
});

describe('getWordsBySurahAyahRange', () => {
  it('returns only words within the ayah range, ordered', async () => {
    // add ayah 2 with one word (seed in beforeAll has only ayah 1)
    const r = await db.execute({
      sql: `INSERT INTO ayahs (surah_id, ayah_number, text_uthmani)
            VALUES (1, 2, 'قُلْ') RETURNING id`,
      args: [],
    });
    const ayah2Id = r.rows[0]?.['id'] as number;
    await db.execute({
      sql: `INSERT INTO words (ayah_id, position, text_arabic, transliteration, pos_tag)
            VALUES (?, 1, 'قُلْ', 'qul', 'V')`,
      args: [ayah2Id],
    });

    const only1 = await getWordsBySurahAyahRange(db, 1, 1, 1);
    expect(only1).toHaveLength(3);

    const only2 = await getWordsBySurahAyahRange(db, 1, 2, 2);
    expect(only2.map((w) => w.text_arabic)).toEqual(['قُلْ']);

    const both = await getWordsBySurahAyahRange(db, 1, 1, 2);
    expect(both).toHaveLength(4);
    // ordered ayah then position: ayah1 pos1..3, then ayah2 pos1
    expect(both.map((w) => w.position)).toEqual([1, 2, 3, 1]);
  });

  it('returns empty array for an out-of-range window', async () => {
    expect(await getWordsBySurahAyahRange(db, 1, 50, 60)).toHaveLength(0);
  });
});

describe('getWordByLocation / getWordDetail', () => {
  it('getWordByLocation returns the word at (surah:ayah:position)', async () => {
    const w = await getWordByLocation(db, 1, 1, 1);
    expect(w?.text_arabic).toBe('بِسْمِ');
  });

  it('getWordByLocation returns null for unknown position', async () => {
    expect(await getWordByLocation(db, 1, 1, 99)).toBeNull();
  });

  it('getWordDetail bundles segments (ordered) + concept tags', async () => {
    const w = await getWordByLocation(db, 1, 1, 1);
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,pos_tag,form_arabic)
            VALUES (?,0,'prefix','P','بِ'),(?,1,'stem','N','سْمِ')`,
      args: [w!.id, w!.id],
    });
    await db.execute({
      sql: `INSERT INTO word_concept_tags (word_id,tag_label,tag_type) VALUES (?, 'Allah','named-entity')`,
      args: [w!.id],
    });
    const detail = await getWordDetail(db, w!.id);
    expect(detail?.segments.map((s) => s.pos_tag)).toEqual(['P', 'N']);
    expect(detail?.segments[0]?.form_arabic).toBe('بِ');
    expect(detail?.concept_tags[0]?.tag_label).toBe('Allah');
  });

  it('getWordDetail returns null for unknown word id', async () => {
    expect(await getWordDetail(db, 99999)).toBeNull();
  });
});
