import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getAyahsBySurah, getAyahWithWords } from '../src/queries/ayahs.js';

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
    sql: `INSERT INTO ayahs (surah_id, ayah_number, text_uthmani, juz, page)
          VALUES (1, 1, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ', 1, 1) RETURNING id`,
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

describe('getAyahsBySurah', () => {
  it('returns all ayahs for a surah', async () => {
    const ayahs = await getAyahsBySurah(db, 1);
    expect(ayahs).toHaveLength(1);
    expect(ayahs[0]?.ayah_number).toBe(1);
  });

  it('returns empty array for unknown surah', async () => {
    const ayahs = await getAyahsBySurah(db, 999);
    expect(ayahs).toHaveLength(0);
  });
});

describe('getAyahWithWords', () => {
  it('returns ayah with its words', async () => {
    const result = await getAyahWithWords(db, ayahId);
    expect(result).not.toBeNull();
    expect(result?.ayah.ayah_number).toBe(1);
    expect(result?.words).toHaveLength(3);
  });

  it('returns words sorted by position', async () => {
    const result = await getAyahWithWords(db, ayahId);
    const positions = result?.words.map((w) => w.position);
    expect(positions).toEqual([1, 2, 3]);
  });

  it('returns null for unknown ayah', async () => {
    const result = await getAyahWithWords(db, 999);
    expect(result).toBeNull();
  });
});
