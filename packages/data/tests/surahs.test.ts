import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getAllSurahs, getSurahById } from '../src/queries/surahs.js';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute({
    sql: `INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
          VALUES (1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 'meccan', 7, 1),
                 (2, 'البقرة', 'Al-Baqarah', 'The Cow', 'medinan', 286, 2)`,
    args: [],
  });
});

afterAll(() => db.close());

describe('getAllSurahs', () => {
  it('returns all surahs ordered by id', async () => {
    const surahs = await getAllSurahs(db);
    expect(surahs).toHaveLength(2);
    expect(surahs[0]?.id).toBe(1);
    expect(surahs[1]?.id).toBe(2);
  });

  it('returns correctly shaped Surah objects', async () => {
    const surahs = await getAllSurahs(db);
    expect(surahs[0]).toMatchObject({
      id: 1,
      name_arabic: 'الفاتحة',
      name_translit: 'Al-Fatihah',
      revelation_type: 'meccan',
      ayah_count: 7,
    });
  });
});

describe('getSurahById', () => {
  it('returns the correct surah', async () => {
    const surah = await getSurahById(db, 2);
    expect(surah?.name_translit).toBe('Al-Baqarah');
  });

  it('returns null for non-existent id', async () => {
    const surah = await getSurahById(db, 999);
    expect(surah).toBeNull();
  });
});
