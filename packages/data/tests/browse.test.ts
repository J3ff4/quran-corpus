import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getJuzIndex, getPageIndex, getRevealedIndex } from '../src/queries/browse.js';

let db: Client;

// A synthetic corpus, not the real one, and deliberately NOT asserting "30 juz"
// or "604 pages": those are facts about the imported data, which no bug in this
// file can change, and there is no full-corpus fixture for CI to build them
// from. What a bug here *can* change is which ayah a juz or page is said to
// start at, so the fixture is shaped to make the wrong answer available:
//
//   juz 1 : 1:1 1:2 (page 1) | 1:3 2:1 2:2 (page 2)
//   juz 2 : 2:6 2:7 2:8               (page 3)
//   juz 3 : 2:9 | 3:1 3:2             (page 4)  <- crosses a surah boundary
//   (3:3 has no juz and no page at all)
//
// Surah 1's ayahs carry ids 20-22, above every other row: that is what a
// delete-and-re-import of one surah leaves behind, since ayahs.id is
// AUTOINCREMENT. It makes juz 1 and page 2 discriminate a query that opens a
// group at its smallest id (2:1, wrong) from one that opens it at its smallest
// (surah_id, ayah_number) pair (1:1 and 1:3, right).
//
// The three order_number values are deliberately NOT equal to the ids, for the
// same reason: that is what the real column held until 2026-08-25, and a
// fixture that repeats it makes the revealed list indistinguishable from the
// surah list whether the query sorts correctly or not.
//
// Juz 3 is the discriminator, and it mirrors the real juz 3 (2:253 -> 3:92):
// MIN(surah_id) and MIN(ayah_number) taken independently answer 2:1, which is a
// real ayah sitting in juz 1. A fixture where every juz starts at ayah 1 of its
// own surah would pass against both the correct query and that bug.
beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute({
    sql: `INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
          VALUES (1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 'meccan', 3, 2),
                 (2, 'البقرة', 'Al-Baqarah', 'The Cow', 'medinan', 9, 3),
                 (3, 'آل عمران', 'Aal-Imran', 'Family of Imran', 'medinan', 3, 1)`,
    args: [],
  });
  // Explicit ids, deliberately NOT ascending in mushaf order -- see the header.
  const ayahs: Array<[number, number, number, number | null, number | null]> = [
    [20, 1, 1, 1, 1],
    [21, 1, 2, 1, 1],
    [22, 1, 3, 1, 2],
    [4, 2, 1, 1, 2],
    [5, 2, 2, 1, 2],
    [6, 2, 6, 2, 3],
    [7, 2, 7, 2, 3],
    [8, 2, 8, 2, 3],
    [9, 2, 9, 3, 4],
    [10, 3, 1, 3, 4],
    [11, 3, 2, 3, 4],
    [12, 3, 3, null, null],
  ];
  for (const [id, surahId, ayahNumber, juz, page] of ayahs) {
    await db.execute({
      sql: `INSERT INTO ayahs (id, surah_id, ayah_number, text_uthmani, juz, page) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, surahId, ayahNumber, 'نص', juz, page],
    });
  }
});

afterAll(() => db.close());

describe('getJuzIndex', () => {
  it('returns every juz in order, each with the ayah it opens on', async () => {
    const rows = await getJuzIndex(db);

    expect(rows.map((r) => r.juz)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ juz: 1, startSurahId: 1, startAyahNumber: 1, surahName: 'Al-Fatihah' });
    expect(rows[1]).toMatchObject({ juz: 2, startSurahId: 2, startAyahNumber: 6 });
  });

  it('opens a juz that starts mid-surah at that ayah, not at ayah 1', async () => {
    const rows = await getJuzIndex(db);

    // The whole reason the subquery orders by the (surah_id, ayah_number) pair
    // rather than by two independent MINs. 2:1 is what the broken version
    // answers, and it is a real ayah.
    expect(rows[2]).toMatchObject({ juz: 3, startSurahId: 2, startAyahNumber: 9, surahName: 'Al-Baqarah' });
  });

  it('counts the ayahs in each juz, including the ones past a surah boundary', async () => {
    const rows = await getJuzIndex(db);

    expect(rows.map((r) => r.ayahCount)).toEqual([5, 3, 3]);
  });

  it('ignores ayahs with no juz rather than reporting a null one', async () => {
    const rows = await getJuzIndex(db);

    // Without the WHERE, GROUP BY yields a NULL group and the list grows a
    // fourth entry whose number renders as NaN.
    expect(rows.every((r) => Number.isInteger(r.juz))).toBe(true);
    expect(rows).toHaveLength(3);
  });

  it('reports the surah ranges a juz covers, in mushaf order', async () => {
    const rows = await getJuzIndex(db);

    // Juz 1 is 1:1-1:3 then 2:1-2:2 (see the fixture header).
    expect(rows[0]?.ranges).toEqual([
      { surahId: 1, surahName: 'Al-Fatihah', firstAyahNumber: 1, lastAyahNumber: 3, ayahCount: 3 },
      { surahId: 2, surahName: 'Al-Baqarah', firstAyahNumber: 1, lastAyahNumber: 2, ayahCount: 2 },
    ]);
  });

  it('orders the ranges by surah, not by ayahs.id', async () => {
    const rows = await getJuzIndex(db);

    // Surah 1's ayahs carry ids 20-22, above every other row -- what a
    // delete-and-re-import leaves behind. A query that ordered by id would put
    // Al-Baqarah first here and the juz would claim to open at 2:1.
    expect(rows[0]?.ranges.map((range) => range.surahId)).toEqual([1, 2]);
    // Juz 3 is 2:9 then 3:1-3:2: one ayah of al-Baqarah, then Aal-Imran.
    expect(rows[2]?.ranges).toEqual([
      { surahId: 2, surahName: 'Al-Baqarah', firstAyahNumber: 9, lastAyahNumber: 9, ayahCount: 1 },
      { surahId: 3, surahName: 'Aal-Imran', firstAyahNumber: 1, lastAyahNumber: 2, ayahCount: 2 },
    ]);
  });

  it('keeps the start ayah and the total agreeing with the ranges', async () => {
    const rows = await getJuzIndex(db);

    for (const row of rows) {
      const first = row.ranges[0];
      expect(first).toBeDefined();
      expect(row.startSurahId).toBe(first?.surahId);
      expect(row.startAyahNumber).toBe(first?.firstAyahNumber);
      expect(row.ayahCount).toBe(row.ranges.reduce((total, range) => total + range.ayahCount, 0));
    }
  });
});

describe('getPageIndex', () => {
  it('returns every page in order, each with the ayah it opens on', async () => {
    const rows = await getPageIndex(db);

    expect(rows.map((r) => r.page)).toEqual([1, 2, 3, 4]);
    expect(rows[0]).toMatchObject({ page: 1, startSurahId: 1, startAyahNumber: 1 });
    // 1:3, not 2:1: surah 1 holds the higher ids here, so a MIN(id) start would
    // skip past the three ayahs the page actually opens with.
    expect(rows[1]).toMatchObject({ page: 2, startSurahId: 1, startAyahNumber: 3, surahName: 'Al-Fatihah' });
  });

  it('opens a page that starts mid-surah at that ayah, not at ayah 1', async () => {
    const rows = await getPageIndex(db);

    expect(rows[3]).toMatchObject({ page: 4, startSurahId: 2, startAyahNumber: 9, surahName: 'Al-Baqarah' });
  });

  it('ignores ayahs with no page rather than reporting a null one', async () => {
    const rows = await getPageIndex(db);

    expect(rows.every((r) => Number.isInteger(r.page))).toBe(true);
    expect(rows).toHaveLength(4);
  });
});

describe('getRevealedIndex', () => {
  it('orders by revelation, not by mushaf order', async () => {
    const rows = await getRevealedIndex(db);

    // Ordering by id looks entirely plausible in a list -- it is the surah
    // index again, under a different heading.
    expect(rows.map((r) => r.surahId)).toEqual([3, 1, 2]);
    expect(rows.map((r) => r.orderNumber)).toEqual([1, 2, 3]);
  });

  it('carries the revelation type and both names for every surah', async () => {
    const rows = await getRevealedIndex(db);

    expect(rows[0]).toMatchObject({
      surahId: 3,
      orderNumber: 1,
      revelationType: 'medinan',
      nameTranslit: 'Aal-Imran',
      nameArabic: 'آل عمران',
    });
    expect(rows.every((r) => r.revelationType === 'meccan' || r.revelationType === 'medinan')).toBe(true);
  });
});
