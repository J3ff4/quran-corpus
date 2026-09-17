import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getSurahNames } from '../src/queries/surahNames.js';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute(`INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
        VALUES (1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 'meccan', 7, 1),
               (9, 'التوبة', 'At-Tawbah', 'The Repentance', 'medinan', 129, 9)`);
  await db.execute(`INSERT INTO languages (code, name_native, name_english, direction)
        VALUES ('uz', 'Ozbekcha', 'Uzbek', 'ltr'), ('ru', 'Russkiy', 'Russian', 'ltr')`);
  // Tavba stores NULL rather than repeating its own name as a meaning.
  await db.execute(`INSERT INTO surah_names (surah_id, language_code, name, meaning)
        VALUES (1, 'uz', 'Fotiha', 'Ochuvchi'), (9, 'uz', 'Tavba', NULL)`);
});

afterAll(() => db.close());

describe('getSurahNames', () => {
  it('returns the stored name and meaning for the requested language', async () => {
    const names = await getSurahNames(db, 'uz');
    expect(names.get(1)).toEqual({ name: 'Fotiha', meaning: 'Ochuvchi' });
  });

  it('keeps a NULL meaning null rather than repeating the name', async () => {
    const names = await getSurahNames(db, 'uz');
    expect(names.get(9)).toEqual({ name: 'Tavba', meaning: null });
  });

  it('falls back to the surahs row for a language with no rows at all', async () => {
    // Russian has a languages row and no surah_names rows. A reader must never
    // see an empty surah name because a translation set is incomplete.
    const names = await getSurahNames(db, 'ru');
    expect(names.get(1)).toEqual({ name: 'Al-Fatihah', meaning: 'The Opening' });
    expect(names.size).toBe(2);
  });

  it('covers every surah, so no call site needs its own fallback', async () => {
    const names = await getSurahNames(db, 'uz');
    expect(names.size).toBe(2);
    expect(names.get(9)?.name).toBe('Tavba');
  });
});
