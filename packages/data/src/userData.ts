// The on-device user database: bookmarks, the last reading position, and
// persisted settings. Schema and SQL live here, not in apps/mobile, because
// packages/data is the single source of truth for both and a second copy in an
// app drifts (see CLAUDE.md §2).
//
// This is a *different* database from the corpus. The corpus ships read-only
// inside the bundle; this one is created on the device and written to. So
// unlike ./mobile, these functions write -- which is why they are exported from
// their own entry point (`@quran-corpus/data/user-db`) rather than folded into
// the read-only mobile subset.
//
// Portable by construction: everything below is plain SQL over QueryClient,
// with no expo-sqlite, React Native or node import anywhere, so the same
// statements would serve a web or desktop client that wired up its own driver.

import type { QueryClient } from './queryClient.js';

/**
 * Schema for the user database, applied on open.
 *
 * `IF NOT EXISTS` throughout: this runs on every open, against a file that
 * survives app upgrades, so it has to be idempotent. Adding a column later
 * needs a real migration step -- this block will not alter an existing table.
 */
export const USER_DB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS bookmarks (
    surah_id INTEGER NOT NULL,
    ayah_number INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (surah_id, ayah_number)
  );
  CREATE TABLE IF NOT EXISTS reading_history (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    surah_id INTEGER NOT NULL,
    ayah_number INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

/**
 * Ayahs per surah, indexed by `surahId - 1`.
 *
 * Inlined rather than queried because this module is the user database and the
 * counts live in the corpus one -- a validator that needed a second connection
 * to run would not be usable from a write path. It is also why the table is
 * inlined rather than split into its own module: `userData.ts` is asserted to be
 * an import-free leaf of the Metro graph (`tests/mobile-entry.test.ts`).
 *
 * Fixed data, so a stale copy is not a risk -- the ayah division of the Hafs
 * text has not moved in centuries. Generated from `surahs.ayah_count` in the
 * corpus DB and cross-checked against `COUNT(*)` and `MAX(ayah_number)` over the
 * `ayahs` table for all 114 rows; the total is the canonical 6236.
 */
const SURAH_AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
  123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
  34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
  60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
  28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
  15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
  5, 4, 5, 6,
] as const;

/**
 * Reject a coordinate that cannot name a real ayah.
 *
 * `INTEGER NOT NULL` is not a range check: SQLite stores 0, -1 and 9999 just as
 * happily, and the corrupt row only shows up later as a bookmark that opens
 * nothing or a "continue reading" link to a surah that does not exist. This is
 * the write boundary for a shared API that any consumer can call, so the check
 * belongs here rather than in whichever screen happens to call it -- the route
 * layer's own validation covers the URL, not a direct call.
 *
 * Bounded per surah, not by the longest one: a global 1..286 cap accepts
 * al-Fatiha ayah 286, which is exactly the kind of row that stores cleanly and
 * then opens nothing. 108 of the 114 surahs are shorter than half that cap.
 */
function assertAyahCoordinate(surahId: number, ayahNumber: number): void {
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > SURAH_AYAH_COUNTS.length) {
    throw new RangeError(`surahId must be an integer in 1..${SURAH_AYAH_COUNTS.length}, got ${surahId}`);
  }
  // Indexed after the range check above, so this is always a number; the
  // fallback exists only to satisfy noUncheckedIndexedAccess.
  const ayahCount = SURAH_AYAH_COUNTS[surahId - 1] ?? 0;
  if (!Number.isInteger(ayahNumber) || ayahNumber < 1 || ayahNumber > ayahCount) {
    throw new RangeError(`ayahNumber must be an integer in 1..${ayahCount} for surah ${surahId}, got ${ayahNumber}`);
  }
}

export interface Bookmark {
  surahId: number;
  ayahNumber: number;
}

export interface ReadingPosition {
  surahId: number;
  ayahNumber: number;
}

export async function setBookmark(
  client: QueryClient,
  surahId: number,
  ayahNumber: number,
  bookmarked: boolean,
): Promise<void> {
  assertAyahCoordinate(surahId, ayahNumber);
  // Guarded too: a JS caller passing a string would take the DELETE branch for
  // '' and the INSERT branch for anything else, so a typo silently becomes the
  // opposite operation.
  if (typeof bookmarked !== 'boolean') {
    throw new TypeError(`bookmarked must be a boolean, got ${typeof bookmarked}`);
  }

  if (bookmarked) {
    await client.execute({
      sql: `INSERT INTO bookmarks (surah_id, ayah_number)
            VALUES (?, ?)
            ON CONFLICT(surah_id, ayah_number) DO NOTHING`,
      args: [surahId, ayahNumber],
    });
    return;
  }

  await client.execute({
    sql: 'DELETE FROM bookmarks WHERE surah_id = ? AND ayah_number = ?',
    args: [surahId, ayahNumber],
  });
}

export async function getBookmarks(client: QueryClient): Promise<Bookmark[]> {
  const result = await client.execute(`
    SELECT surah_id, ayah_number
    FROM bookmarks
    ORDER BY surah_id, ayah_number
  `);

  return result.rows.map((row) => ({
    surahId: Number(row.surah_id),
    ayahNumber: Number(row.ayah_number),
  }));
}

export async function recordReadingPosition(
  client: QueryClient,
  surahId: number,
  ayahNumber: number,
): Promise<void> {
  assertAyahCoordinate(surahId, ayahNumber);

  await client.execute({
    sql: `INSERT INTO reading_history (id, surah_id, ayah_number, updated_at)
          VALUES (1, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            surah_id = excluded.surah_id,
            ayah_number = excluded.ayah_number,
            updated_at = CURRENT_TIMESTAMP`,
    args: [surahId, ayahNumber],
  });
}

export async function getLastReadingPosition(client: QueryClient): Promise<ReadingPosition | null> {
  const result = await client.execute(`
    SELECT surah_id, ayah_number
    FROM reading_history
    WHERE id = 1
  `);
  const row = result.rows[0];
  if (!row) return null;

  return {
    surahId: Number(row.surah_id),
    ayahNumber: Number(row.ayah_number),
  };
}

export async function saveSetting(client: QueryClient, key: string, value: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP`,
    args: [key, value],
  });
}

export async function getSetting(client: QueryClient, key: string): Promise<string | null> {
  const result = await client.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: [key],
  });
  const value = result.rows[0]?.value;
  return value == null ? null : String(value);
}
