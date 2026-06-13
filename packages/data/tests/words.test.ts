import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getWordsByAyah, getWordsBySurah } from '../src/queries/words.js';

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
