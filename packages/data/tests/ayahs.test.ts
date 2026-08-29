import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import type { QueryClient } from '../src/queryClient.js';
import { runMigrations } from '../src/migrate.js';
import { getAyahPreviews, getAyahsBySurah, getAyahWithWords } from '../src/queries/ayahs.js';

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

describe('getAyahPreviews', () => {
  /** A second surah, so a coordinate pair can be shown to match on BOTH halves.
   *  With one surah in the fixture, `ayah_number` alone would answer every
   *  assertion and the surah half of the match would be untested. */
  beforeAll(async () => {
    await db.execute({
      sql: `INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
            VALUES (2, 'البقرة', 'Al-Baqara', 'The Cow', 'medinan', 286, 2)`,
      args: [],
    });
    await db.execute({
      sql: `INSERT INTO ayahs (surah_id, ayah_number, text_uthmani, juz, page)
            VALUES (2, 1, 'الم', 1, 2), (2, 255, 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ', 3, 42)`,
      args: [],
    });
  });

  it('returns only the coordinates asked for', async () => {
    const previews = await getAyahPreviews(db, [
      { surahId: 2, ayahNumber: 255 },
      { surahId: 1, ayahNumber: 1 },
    ]);

    expect(previews.map((p) => `${p.surah_id}:${p.ayah_number}`)).toEqual(['1:1', '2:255']);
    expect(previews[1]?.text_uthmani).toContain('إِلَّا هُوَ');
  });

  it('matches on the surah as well as the ayah number', async () => {
    // 1:1 and 2:1 both exist. A WHERE that dropped the surah half would return
    // both, and the bookmarks list would show al-Fatiha's text under a Baqara
    // coordinate.
    const previews = await getAyahPreviews(db, [{ surahId: 2, ayahNumber: 1 }]);

    expect(previews).toHaveLength(1);
    expect(previews[0]?.surah_id).toBe(2);
  });

  it('omits a coordinate that matches nothing, rather than failing', async () => {
    // 2:300 does not exist. A bookmark can outlive the row it points at if a
    // corpus rebuild ever changes one, and the list must still render.
    const previews = await getAyahPreviews(db, [
      { surahId: 2, ayahNumber: 300 },
      { surahId: 1, ayahNumber: 1 },
    ]);

    expect(previews.map((p) => p.surah_id)).toEqual([1]);
  });

  it('returns nothing for an empty request without touching the database', async () => {
    // An empty OR-chain would produce `WHERE ` and a syntax error -- the state
    // the screen is in before the first bookmark is saved.
    expect(await getAyahPreviews(db, [])).toEqual([]);
  });

  it('splits a large request across several statements', async () => {
    // Counted, not inferred. libsql's own build raises the variable limit well
    // above 999, so asking for 500 pairs and getting rows back proves nothing
    // about chunking -- it passes just as happily unchunked. The number of
    // statements that reach the driver is the only thing that does.
    const statements: string[] = [];
    const counting: QueryClient = {
      async execute(statement) {
        statements.push(typeof statement === 'string' ? statement : statement.sql);
        return db.execute(statement);
      },
    };
    const many = Array.from({ length: 500 }, (_, i) => ({
      surahId: 2,
      ayahNumber: (i % 255) + 1,
    }));

    const previews = await getAyahPreviews(counting, [...many, { surahId: 1, ayahNumber: 1 }]);

    expect(statements).toHaveLength(2);
    expect(previews.map((p) => `${p.surah_id}:${p.ayah_number}`)).toContain('1:1');
  });

  it('orders across chunk boundaries, not only within one', async () => {
    // The per-chunk ORDER BY sorts each statement's rows; it cannot sort rows
    // that came from an earlier statement. 400 copies of 2:1 fill the first
    // chunk, so 1:1 is answered by the second -- and unsorted it lands last,
    // which is the opposite of the documented mushaf order.
    const statements: string[] = [];
    const counting: QueryClient = {
      async execute(statement) {
        statements.push(typeof statement === 'string' ? statement : statement.sql);
        return db.execute(statement);
      },
    };
    const filler = Array.from({ length: 400 }, () => ({ surahId: 2, ayahNumber: 1 }));

    const previews = await getAyahPreviews(counting, [...filler, { surahId: 1, ayahNumber: 1 }]);

    // Asserted, not assumed: if the chunk size ever grows past 401 this all
    // arrives in one statement, SQL sorts it, and the ordering assertion below
    // would pass while testing nothing.
    expect(statements).toHaveLength(2);
    expect(previews.map((p) => `${p.surah_id}:${p.ayah_number}`)).toEqual(['1:1', '2:1']);
  });

  it('refuses a non-integer coordinate instead of silently matching nothing', async () => {
    await expect(
      getAyahPreviews(db, [{ surahId: 2, ayahNumber: '255' as unknown as number }]),
    ).rejects.toThrow(TypeError);
  });
});
