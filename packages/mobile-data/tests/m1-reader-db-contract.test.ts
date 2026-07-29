import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../data/src/db.js';
import { parseM1TranslationSelection, validateM1ReaderDbContract } from '../scripts/create-m1-reader-db';

const dbPath = resolve('../../apps/mobile/assets/db/quran.db');

describe('M1 reader DB contract', () => {
  it('requires exactly one selected translator row for each M1 language', () => {
    const validApproval = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| uz | Muhammad Sodik Muhammad Yusuf |
| ru | Abu Adel |
`;

    expect(parseM1TranslationSelection(validApproval)).toEqual({
      en: 'Saheeh International',
      ru: 'Abu Adel',
      uz: 'Muhammad Sodik Muhammad Yusuf',
    });

    const duplicateRussianSelection = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| uz | Muhammad Sodik Muhammad Yusuf |
| ru | Abu Adel |
| ru | Elmir Kuliev |
`;

    expect(() => parseM1TranslationSelection(duplicateRussianSelection)).toThrow(
      'M1 translation selection must contain exactly one selected translator for en, uz, and ru.',
    );

    const missingUzbekSelection = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| ru | Abu Adel |
`;

    expect(() => parseM1TranslationSelection(missingUzbekSelection)).toThrow(
      'M1 translation selection must contain exactly one selected translator for en, uz, and ru.',
    );
  });

  it('contains complete reader rows and selected translations', async () => {
    expect(existsSync(dbPath)).toBe(true);

    const summary = await validateM1ReaderDbContract(dbPath);

    expect(summary).toEqual({
      surahs: 114,
      ayahs: 6236,
      words: 77429,
      languages: ['en', 'ru', 'uz'],
      selectedTranslations: {
        en: { translator: 'Saheeh International', rows: 6236 },
        ru: { translator: 'Abu Adel', rows: 6236 },
        uz: { translator: 'Muhammad Sodik Muhammad Yusuf', rows: 6236 },
      },
    });
  });

  it('keeps the raw DB compatible with reader-critical counts', async () => {
    const db = createDatabase(`file:${dbPath}`);

    try {
      const surahs = await db.execute('SELECT count(*) AS n FROM surahs');
      const ayahs = await db.execute('SELECT count(*) AS n FROM ayahs');
      const words = await db.execute('SELECT count(*) AS n FROM words');
      const languages = await db.execute("SELECT code FROM languages WHERE code IN ('en', 'uz', 'ru') ORDER BY code");
      const translations = await db.execute(`
        SELECT language_code, count(*) AS n
        FROM translations
        WHERE language_code IN ('en', 'uz', 'ru')
        GROUP BY language_code
        ORDER BY language_code
      `);

      expect(surahs.rows[0]?.n).toBe(114);
      expect(ayahs.rows[0]?.n).toBe(6236);
      expect(Number(words.rows[0]?.n)).toBeGreaterThan(0);
      expect(languages.rows.map((row) => row.code)).toEqual(['en', 'ru', 'uz']);
      expect(translations.rows.map((row) => row.language_code)).toEqual(['en', 'ru', 'uz']);
      for (const row of translations.rows) {
        expect(Number(row.n)).toBeGreaterThanOrEqual(6236);
      }
    } finally {
      db.close();
    }
  });
});
