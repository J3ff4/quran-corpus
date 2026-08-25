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
 * Schema changes past the baseline, applied in order.
 *
 * Version 1 *is* `USER_DB_SCHEMA` above, which every open applies and which is
 * idempotent. Everything after it needs a version number, because the
 * statements are not: `ALTER TABLE ... ADD COLUMN` throws on the second run,
 * and a caught-and-ignored throw is indistinguishable from a migration that
 * silently did nothing.
 *
 * Additive only, and that is a rule rather than a coincidence: this file lives
 * on a user's phone and survives app updates, so a build that rewrites or drops
 * data has no way back. It also means an older build still opens a newer file --
 * it simply does not see the new tables.
 *
 * **One statement per entry in `statements`.** Both drivers execute a single
 * statement -- libsql's `execute` rejects the rest, and the mobile client routes
 * through expo's `getAllAsync`, which prepares one -- so a migration written as
 * a single multi-statement string would create its first table and skip the
 * others, on every device, silently. `USER_DB_SCHEMA` gets away with being one
 * string only because apps/mobile hands it to `execAsync`, which does take
 * several.
 */
export const USER_DB_MIGRATIONS: readonly { version: number; statements: readonly string[] }[] = [
  {
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS reading_days (
         day TEXT PRIMARY KEY,
         recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE TABLE IF NOT EXISTS root_views (
         root_id INTEGER NOT NULL,
         day TEXT NOT NULL,
         PRIMARY KEY (root_id, day)
       )`,
    ],
  },
];

/** The version a file is at once every migration above has been applied. */
export const USER_DB_VERSION = USER_DB_MIGRATIONS.length + 1;

/**
 * Apply pending migrations and return the version the file is at when it
 * returns.
 *
 * `PRAGMA user_version` is SQLite's own four-byte slot in the header, so this
 * needs no bookkeeping table of its own. It reads 0 on a file that predates
 * this function, which is exactly right: every migration below is above 0, so
 * an existing install gets all of them, and each one is `IF NOT EXISTS` anyway.
 *
 * A file from a *newer* build is left alone rather than stamped back down.
 * Rewriting the version there would make this build re-apply everything on the
 * next open and would hand the newer build a file that lies about its own
 * shape; additive-only migrations mean the old build can read the new file as
 * it is.
 *
 * Callers run this on every open, after applying USER_DB_SCHEMA.
 */
export async function migrateUserDb(client: QueryClient): Promise<number> {
  const result = await client.execute('PRAGMA user_version');
  const raw = Number(result.rows[0]?.['user_version'] ?? 0);
  // A non-integer here means the pragma read back as something SQLite should
  // never produce. Treating it as 0 re-runs migrations that are all
  // IF NOT EXISTS anyway; trusting it would leave NaN in every comparison
  // below, which silently skips the version stamp and repeats this forever.
  const current = Number.isInteger(raw) ? raw : 0;

  for (const migration of USER_DB_MIGRATIONS) {
    if (migration.version <= current) continue;
    for (const statement of migration.statements) {
      await client.execute(statement);
    }
  }

  if (current >= USER_DB_VERSION) return current;

  // Not parameterizable: PRAGMA takes a literal. USER_DB_VERSION is a number
  // computed in this module, never caller input, so there is nothing to
  // inject -- but keep it that way if this ever takes an argument.
  await client.execute(`PRAGMA user_version = ${USER_DB_VERSION}`);
  return USER_DB_VERSION;
}

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

/** Roots in the corpus are 1..1548 today; the cap carries headroom for a
 *  re-import the way the Buckwalter length caps do. A view row is only ever
 *  counted, never joined back for display, so an id past the end would inflate
 *  a number with nothing on screen to reveal it. */
const MAX_ROOT_ID = 5000;

/**
 * True for a calendar day in `YYYY-MM-DD`, and only for one that exists.
 *
 * The regex alone accepts 2026-02-30 and 2026-13-01. Both are storable, both
 * are PRIMARY KEYs, and both would sit in the streak table for ever -- so the
 * round-trip through Date is the actual check and the regex only fixes the
 * shape (Date parses far too much on its own, including full timestamps).
 *
 * The NaN guard is not belt-and-braces: 2026-13-01 parses to an Invalid Date,
 * and `toISOString()` on one throws RangeError. Without the guard this
 * predicate throws on the very input it exists to reject, so `if (isIsoDay(x))`
 * would crash instead of taking the false branch.
 */
export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

function assertIsoDay(day: string): void {
  if (!isIsoDay(day)) throw new RangeError(`day must be an ISO calendar day (YYYY-MM-DD), got ${day}`);
}

export async function recordReadingDay(client: QueryClient, day: string): Promise<void> {
  assertIsoDay(day);
  await client.execute({
    sql: 'INSERT INTO reading_days (day) VALUES (?) ON CONFLICT(day) DO NOTHING',
    args: [day],
  });
}

export async function getReadingDays(client: QueryClient, sinceDay: string): Promise<string[]> {
  assertIsoDay(sinceDay);
  const result = await client.execute({
    sql: 'SELECT day FROM reading_days WHERE day >= ? ORDER BY day DESC',
    args: [sinceDay],
  });
  return result.rows.map((row) => String(row.day));
}

export async function recordRootView(client: QueryClient, rootId: number, day: string): Promise<void> {
  if (!Number.isInteger(rootId) || rootId < 1 || rootId > MAX_ROOT_ID) {
    throw new RangeError(`rootId must be an integer in 1..${MAX_ROOT_ID}, got ${rootId}`);
  }
  assertIsoDay(day);
  await client.execute({
    sql: 'INSERT INTO root_views (root_id, day) VALUES (?, ?) ON CONFLICT(root_id, day) DO NOTHING',
    args: [rootId, day],
  });
}

export async function countDistinctRootsViewed(client: QueryClient): Promise<number> {
  const result = await client.execute('SELECT COUNT(DISTINCT root_id) AS roots FROM root_views');
  return Number(result.rows[0]?.roots ?? 0);
}

export async function getRootViewsByDay(
  client: QueryClient,
  sinceDay: string,
): Promise<{ day: string; roots: number }[]> {
  assertIsoDay(sinceDay);
  const result = await client.execute({
    sql: `SELECT day, COUNT(DISTINCT root_id) AS roots
          FROM root_views
          WHERE day >= ?
          GROUP BY day
          ORDER BY day DESC`,
    args: [sinceDay],
  });
  return result.rows.map((row) => ({ day: String(row.day), roots: Number(row.roots) }));
}
