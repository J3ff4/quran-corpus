import type { QueryClient } from '../queryClient.js';

export interface JuzEntry {
  juz: number;
  startSurahId: number;
  startAyahNumber: number;
  surahName: string;
  ayahCount: number;
}

export interface RevealedEntry {
  surahId: number;
  orderNumber: number;
  revelationType: 'meccan' | 'medinan';
  nameArabic: string;
  nameTranslit: string;
}

export interface PageEntry {
  page: number;
  startSurahId: number;
  startAyahNumber: number;
  surahName: string;
}

/**
 * The juz index: thirty rows, each pointing at the ayah the juz opens on.
 *
 * The start ayah is the smallest (surah_id, ayah_number) *pair* in the juz, not
 * MIN(surah_id) and MIN(ayah_number) taken separately -- those are independent
 * aggregates over the group and answer with a coordinate that need not be in
 * it. Juz 3 runs 2:253 to 3:92; independently they say 2:1, which is a real
 * ayah, in a different juz, and looks entirely plausible in a list.
 *
 * Not MIN(id) either, though it agrees today: `ayahs.id` is AUTOINCREMENT, so
 * ids are assigned in insertion order, not mushaf order. Re-importing one surah
 * after a delete (tests/test_corpus_import.py does exactly that, and so does a
 * manual repair) hands that surah the highest ids in the table, and every juz
 * and page it touches would then report a start ayah from the wrong end of
 * itself, with nothing anywhere to raise. ROW_NUMBER states the ordering
 * intrinsically and cannot drift from it.
 *
 * No index on `ayahs.juz`: this is one windowed scan of 6236 rows, run once per
 * mode switch, and adding one would be a schema change (M6c forbids those).
 */
export async function getJuzIndex(client: QueryClient): Promise<JuzEntry[]> {
  const result = await client.execute(`
    SELECT juz, start_surah_id, start_ayah_number, surah_name, ayah_count
    FROM (
      SELECT a.juz,
             a.surah_id      AS start_surah_id,
             a.ayah_number   AS start_ayah_number,
             s.name_translit AS surah_name,
             COUNT(*)     OVER (PARTITION BY a.juz) AS ayah_count,
             ROW_NUMBER() OVER (PARTITION BY a.juz ORDER BY a.surah_id, a.ayah_number) AS rn
      FROM ayahs  a
      JOIN surahs s ON s.id = a.surah_id
      WHERE a.juz IS NOT NULL
    )
    WHERE rn = 1
    ORDER BY juz
  `);

  return result.rows.map((row) => ({
    juz: Number(row['juz']),
    startSurahId: Number(row['start_surah_id']),
    startAyahNumber: Number(row['start_ayah_number']),
    surahName: String(row['surah_name']),
    ayahCount: Number(row['ayah_count']),
  }));
}

/**
 * The page index: 604 rows, each pointing at the ayah the page opens on.
 *
 * Same ordering reasoning as getJuzIndex, and the same failure mode -- pages
 * cross surah boundaries far more often than juz do. No ayah count: a page is
 * a fixed slab of glyphs, and "12 ayahs" says nothing a reader wants.
 *
 * Decision 20: this is a jump target, not a mushaf page. The reader opens
 * scrolled to this ayah; it does not render a fixed 15-line page.
 */
export async function getPageIndex(client: QueryClient): Promise<PageEntry[]> {
  const result = await client.execute(`
    SELECT page, start_surah_id, start_ayah_number, surah_name
    FROM (
      SELECT a.page,
             a.surah_id      AS start_surah_id,
             a.ayah_number   AS start_ayah_number,
             s.name_translit AS surah_name,
             ROW_NUMBER() OVER (PARTITION BY a.page ORDER BY a.surah_id, a.ayah_number) AS rn
      FROM ayahs  a
      JOIN surahs s ON s.id = a.surah_id
      WHERE a.page IS NOT NULL
    )
    WHERE rn = 1
    ORDER BY page
  `);

  return result.rows.map((row) => ({
    page: Number(row['page']),
    startSurahId: Number(row['start_surah_id']),
    startAyahNumber: Number(row['start_ayah_number']),
    surahName: String(row['surah_name']),
  }));
}

/**
 * The surah list in revelation order (tartib an-nuzul), Meccan then Medinan.
 *
 * `surahs.order_number` is the revelation rank; the mushaf order is `id`. The
 * column held a copy of `id` until 2026-08-25, which made this list render
 * identically to the plain surah index -- wrong, and entirely plausible on
 * screen. packages/scraper/scraper/surah_meta.py is the source of those ranks
 * and the only thing that may change them.
 *
 * Grouping into the two periods is the caller's job: the hijra splits the
 * ranks cleanly (1-86 Meccan, 87-114 Medinan), so a section list only has to
 * cut where revelationType changes.
 */
export async function getRevealedIndex(client: QueryClient): Promise<RevealedEntry[]> {
  const result = await client.execute(`
    SELECT id, order_number, revelation_type, name_arabic, name_translit
    FROM surahs
    ORDER BY order_number
  `);

  return result.rows.map((row) => ({
    surahId: Number(row['id']),
    orderNumber: Number(row['order_number']),
    revelationType: row['revelation_type'] as 'meccan' | 'medinan',
    nameArabic: String(row['name_arabic']),
    nameTranslit: String(row['name_translit']),
  }));
}
