import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getTranslationsByAyah, getTranslation, getTranslationsBySurahAndLang } from '../src/queries/translations.js';

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
    sql: `INSERT INTO ayahs (surah_id, ayah_number, text_uthmani) VALUES (1, 1, 'بِسْمِ ٱللَّهِ') RETURNING id`,
    args: [],
  });
  ayahId = r.rows[0]?.['id'] as number;

  await db.execute({
    sql: `INSERT INTO languages (code, name_native, name_english, direction) VALUES
          ('en', 'English', 'English', 'ltr'),
          ('uz', 'O''zbek', 'Uzbek', 'ltr'),
          ('ru', 'Русский', 'Russian', 'ltr')`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO translations (ayah_id, language_code, translator, text) VALUES
          (?, 'en', 'Sahih International', 'In the name of Allah, the Entirely Merciful.'),
          (?, 'uz', 'Uzbek Translation', 'Mehribon va Rahmli Allohning nomi bilan.')`,
    args: [ayahId, ayahId],
  });
});

afterAll(() => db.close());

describe('getTranslationsByAyah', () => {
  it('returns all translations for an ayah', async () => {
    const translations = await getTranslationsByAyah(db, ayahId);
    expect(translations).toHaveLength(2);
  });

  it('returns translations with correct shape', async () => {
    const translations = await getTranslationsByAyah(db, ayahId);
    expect(translations[0]).toMatchObject({
      ayah_id: ayahId,
      language_code: 'en',
      translator: 'Sahih International',
    });
  });
});

describe('getTranslation', () => {
  it('returns a specific translation by ayah and language', async () => {
    const t = await getTranslation(db, ayahId, 'uz');
    expect(t?.language_code).toBe('uz');
    expect(t?.text).toContain('Mehribon');
  });

  it('returns null for missing language', async () => {
    const t = await getTranslation(db, ayahId, 'ru');
    expect(t).toBeNull();
  });
});

describe('getTranslationsBySurahAndLang', () => {
  it('returns translations for a surah in given language', async () => {
    const translations = await getTranslationsBySurahAndLang(db, 1, 'en');
    expect(translations.length).toBeGreaterThan(0);
    expect(translations[0]?.language_code).toBe('en');
  });

  it('returns empty array when language has no translations', async () => {
    const translations = await getTranslationsBySurahAndLang(db, 1, 'uz');
    expect(translations).toHaveLength(1);
  });

  it('returns empty array for unknown surah', async () => {
    const translations = await getTranslationsBySurahAndLang(db, 999, 'en');
    expect(translations).toHaveLength(0);
  });
});
