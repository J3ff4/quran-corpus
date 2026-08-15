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

/** 114 surahs; al-Baqarah is the longest at 286 ayahs. */
const SURAH_COUNT = 114;
const LONGEST_SURAH_AYAH_COUNT = 286;

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
 * Deliberately the widest plausible bound rather than the true ayah count for
 * the given surah: this package holds no per-surah counts without a query, and
 * the point is to reject the impossible, not to re-derive the corpus.
 */
function assertAyahCoordinate(surahId: number, ayahNumber: number): void {
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > SURAH_COUNT) {
    throw new RangeError(`surahId must be an integer in 1..${SURAH_COUNT}, got ${surahId}`);
  }
  if (!Number.isInteger(ayahNumber) || ayahNumber < 1 || ayahNumber > LONGEST_SURAH_AYAH_COUNT) {
    throw new RangeError(`ayahNumber must be an integer in 1..${LONGEST_SURAH_AYAH_COUNT}, got ${ayahNumber}`);
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
