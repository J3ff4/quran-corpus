import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getGlossesBySurahAndLang } from '../src/queries/glosses.js';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);

  await db.execute({
    sql: `INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
          VALUES (1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 'meccan', 7, 1)`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO languages (code, name_native, name_english, direction)
          VALUES ('en', 'English', 'English', 'ltr')`,
    args: [],
  });
  const a = await db.execute({
    sql: `INSERT INTO ayahs (surah_id, ayah_number, text_uthmani) VALUES (1, 1, 'بِسْمِ ٱللَّهِ') RETURNING id`,
    args: [],
  });
  const ayahId = a.rows[0]?.['id'] as number;

  const w1 = await db.execute({
    sql: `INSERT INTO words (ayah_id, position, text_arabic) VALUES (?, 1, 'بِسْمِ') RETURNING id`,
    args: [ayahId],
  });
  const w2 = await db.execute({
    sql: `INSERT INTO words (ayah_id, position, text_arabic) VALUES (?, 2, 'ٱللَّهِ') RETURNING id`,
    args: [ayahId],
  });
  const word1Id = w1.rows[0]?.['id'] as number;
  const word2Id = w2.rows[0]?.['id'] as number;

  await db.execute({
    sql: `INSERT INTO word_glosses (word_id, language_code, gloss_text) VALUES
          (?, 'en', 'In (the) name'),
          (?, 'en', 'Allah')`,
    args: [word1Id, word2Id],
  });
});

afterAll(() => db.close());

describe('getGlossesBySurahAndLang', () => {
  it('returns all glosses for the surah in the language', async () => {
    const glosses = await getGlossesBySurahAndLang(db, 1, 'en');
    expect(glosses).toHaveLength(2);
    const texts = glosses.map((g) => g.gloss_text).sort();
    expect(texts).toEqual(['Allah', 'In (the) name']);
  });

  it('returns empty for a language with no glosses', async () => {
    const glosses = await getGlossesBySurahAndLang(db, 1, 'ru');
    expect(glosses).toEqual([]);
  });

  it('returns empty for a surah with no words', async () => {
    const glosses = await getGlossesBySurahAndLang(db, 2, 'en');
    expect(glosses).toEqual([]);
  });
});
