import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getGlossesBySurahAndLang, getGlossesWithFallback } from '../src/queries/glosses.js';

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

  await db.execute({
    sql: `INSERT INTO languages (code, name_native, name_english, direction)
          VALUES ('uz', 'O''zbekcha', 'Uzbek', 'ltr')`,
    args: [],
  });
  // Both words share one Uzbek gloss under group 7 -- Tasnim glosses the
  // phrase, not the word. word 2 also has an EN row, so the fallback branch
  // still has something to lose to.
  await db.execute({
    sql: `INSERT INTO word_glosses (word_id, language_code, gloss_text, gloss_group) VALUES
          (?, 'uz', 'nomi bilan', 7), (?, 'uz', 'nomi bilan', 7)`,
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

describe('getGlossesWithFallback', () => {
  it('returns uz gloss where present, EN fallback where missing', async () => {
    const rows = await getGlossesWithFallback(db, 1, 'uz');
    const byWord = Object.fromEntries(rows.map((r) => [r.word_id, r]));
    expect(byWord[1]).toMatchObject({ gloss_text: 'nomi bilan', gloss_lang: 'uz' });
    expect(byWord[2]).toMatchObject({ gloss_text: 'nomi bilan', gloss_lang: 'uz' });
  });

  it('carries gloss_group through the COALESCE', async () => {
    const rows = await getGlossesWithFallback(db, 1, 'uz');
    expect(rows.map((r) => r.gloss_group)).toEqual([7, 7]);
  });

  it('does not take the fallback row\'s group when the preferred row won', async () => {
    // EN is ungrouped and UZ is grouped, so asking for EN with a UZ fallback
    // is the case that separates "the winning row's group" from "whichever
    // group is non-null": every word here has BOTH rows, EN wins, and EN's
    // group is NULL. A COALESCE would hand back UZ's 7 and span two words
    // that the English segmentation glosses separately.
    const rows = await getGlossesWithFallback(db, 1, 'en', 'uz');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.gloss_lang === 'en' && r.gloss_group === null)).toBe(true);
  });

  it('reports gloss_group null when the fallback row won', async () => {
    // The group belongs to whichever row supplied the text. An EN fallback is
    // ungrouped, so a UI that spans by group must not inherit uz's grouping.
    const rows = await getGlossesWithFallback(db, 1, 'ru');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.gloss_lang === 'en' && r.gloss_group === null)).toBe(true);
  });

  it('lang=en yields all gloss_lang=en', async () => {
    const rows = await getGlossesWithFallback(db, 1, 'en');
    expect(rows.every((r) => r.gloss_lang === 'en')).toBe(true);
  });
});
