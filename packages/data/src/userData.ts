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
