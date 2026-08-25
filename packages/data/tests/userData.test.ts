import { describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db.js';
import type { QueryClient } from '../src/queryClient.js';
import {
  USER_DB_MIGRATIONS,
  USER_DB_SCHEMA,
  USER_DB_VERSION,
  getBookmarks,
  migrateUserDb,
  recordReadingPosition,
  setBookmark,
} from '../src/userData.js';

/** Records what reached the driver, so a rejected write can be shown to have
 *  produced no statement at all rather than a harmless one. */
function recordingClient() {
  const statements: string[] = [];
  const client: QueryClient = {
    async execute(statement) {
      statements.push(typeof statement === 'string' ? statement : statement.sql);
      return { rows: [] };
    },
  };
  return { client, statements };
}

describe('user-data write validation', () => {
  // `INTEGER NOT NULL` accepts every one of these, which is the whole point:
  // the column type is not a range check, so a bad coordinate would persist and
  // only surface later as a bookmark that opens nothing.
  const badCoordinates: Array<[string, number, number]> = [
    ['surah zero', 0, 1],
    ['negative surah', -1, 1],
    ['surah past the last one', 115, 1],
    ['ayah zero', 1, 0],
    ['negative ayah', 1, -5],
    ['ayah past the longest surah', 1, 287],
    ['fractional surah', 1.5, 1],
    ['fractional ayah', 1, 2.5],
    ['NaN', Number.NaN, 1],
    ['Infinity', 1, Number.POSITIVE_INFINITY],
    // Within 1..286, so a single global cap accepted all of these. Each one
    // stores cleanly and then opens nothing, because the surah has no such ayah.
    ['ayah past the end of al-Fatiha', 1, 8],
    ['ayah past the end of an-Nas', 114, 7],
    ['al-Baqarah ayah count applied to the next surah', 3, 286],
    ['ayah past the end of the shortest surah', 108, 4],
  ];

  it.each(badCoordinates)('rejects a bookmark with %s', async (_label, surahId, ayahNumber) => {
    const { client, statements } = recordingClient();

    await expect(setBookmark(client, surahId, ayahNumber, true)).rejects.toThrow(RangeError);
    expect(statements).toEqual([]);
  });

  it.each(badCoordinates)('rejects a reading position with %s', async (_label, surahId, ayahNumber) => {
    const { client, statements } = recordingClient();

    await expect(recordReadingPosition(client, surahId, ayahNumber)).rejects.toThrow(RangeError);
    expect(statements).toEqual([]);
  });

  it('rejects a non-boolean bookmarked flag', async () => {
    const { client, statements } = recordingClient();

    // The branch is `if (bookmarked)`, so a JS caller passing '' would delete
    // and 'false' would insert -- the opposite operation, silently.
    await expect(setBookmark(client, 2, 255, 'false' as never)).rejects.toThrow(TypeError);
    expect(statements).toEqual([]);
  });

  it('writes the boundary coordinates that are actually valid', async () => {
    const { client, statements } = recordingClient();

    // Each one is the last ayah of its own surah -- the largest coordinate the
    // per-surah bound may still accept.
    await setBookmark(client, 1, 7, true);
    await setBookmark(client, 114, 6, false);
    await recordReadingPosition(client, 2, 286);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain('INSERT INTO bookmarks');
    expect(statements[1]).toContain('DELETE FROM bookmarks');
    expect(statements[2]).toContain('INSERT INTO reading_history');
  });

  // The counts are inlined, so nothing at runtime would notice a mistyped digit
  // -- it would just quietly accept or reject one wrong coordinate. 6236 is the
  // canonical total of the Hafs text, so a single wrong entry fails this.
  it('accepts the last ayah of every surah and rejects the one after it', async () => {
    const { client, statements } = recordingClient();
    let total = 0;

    for (let surahId = 1; surahId <= 114; surahId += 1) {
      let lastValid = 0;
      for (let ayahNumber = 1; ayahNumber <= 287; ayahNumber += 1) {
        try {
          await recordReadingPosition(client, surahId, ayahNumber);
          lastValid = ayahNumber;
        } catch {
          break;
        }
      }
      expect(lastValid).toBeGreaterThan(0);
      total += lastValid;
    }

    expect(total).toBe(6236);
    expect(statements).toHaveLength(6236);
  });
});


/** A real in-memory file, because every assertion below is about SQLite's own
 *  `PRAGMA user_version` and about tables actually existing -- neither of which
 *  a recording double can answer. `executeMultiple` rather than `execute`:
 *  USER_DB_SCHEMA is three statements and libsql's execute takes one. */
function memoryUserDb() {
  const db = createDatabase('file::memory:');
  return db;
}

/** Wraps a client and records every statement that reaches the driver, so
 *  "nothing ran" can be asserted as an empty list rather than inferred from an
 *  unchanged database. */
function recordingProxy(client: QueryClient) {
  const statements: string[] = [];
  const proxy: QueryClient = {
    async execute(statement) {
      statements.push(typeof statement === 'string' ? statement : statement.sql);
      return client.execute(statement);
    },
  };
  return { proxy, statements };
}

describe('migrateUserDb', () => {
  it('brings a fresh file to the current version', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);

    expect(await migrateUserDb(db)).toBe(USER_DB_VERSION);
    const after = await db.execute('PRAGMA user_version');
    expect(Number(after.rows[0]!['user_version'])).toBe(USER_DB_VERSION);

    db.close();
  });

  it('creates the tables the migrations declare', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);

    await migrateUserDb(db);

    // Bumping user_version without running the statements would pass every
    // other test here: the pragma would read right and the no-op test would
    // still be a no-op. Only asking the schema catches it.
    const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const names = tables.rows.map((row) => String(row['name']));
    expect(names).toContain('reading_days');
    expect(names).toContain('root_views');

    db.close();
  });

  it('is a no-op on a file already at the current version', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);
    await migrateUserDb(db);

    // Runs on every app launch. A migration that re-applies is how an
    // ALTER TABLE in a later version throws "duplicate column" on the second
    // start and locks the user out of their own data.
    expect(await migrateUserDb(db)).toBe(USER_DB_VERSION);

    db.close();
  });

  it('preserves rows written before the migration ran', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);
    await setBookmark(db, 2, 255, true);

    await migrateUserDb(db);

    // The whole reason this is versioned rather than a schema rewrite: the
    // file is on the owner's phone and predates every migration in the list.
    expect(await getBookmarks(db)).toEqual([{ surahId: 2, ayahNumber: 255 }]);

    db.close();
  });

  it('applies only the migrations above the file version', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);
    await db.execute(`PRAGMA user_version = ${USER_DB_VERSION}`);
    const { proxy, statements } = recordingProxy(db);

    await migrateUserDb(proxy);

    // Every migration statement, flattened -- so this fails if any one of them
    // runs against a file that is already current, not just the first.
    const migrationSql = USER_DB_MIGRATIONS.flatMap((migration) => migration.statements);
    expect(statements.filter((statement) => migrationSql.includes(statement))).toEqual([]);

    db.close();
  });

  it('leaves a file from a newer build alone', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);
    await db.execute(`PRAGMA user_version = ${USER_DB_VERSION + 5}`);

    // Downgrading the pragma would make the *next* run of this build re-apply
    // every migration, and hand a future build a file that lies about its own
    // shape. Additive-only migrations mean an older build can open a newer
    // file; it just must not rewrite the version it found.
    expect(await migrateUserDb(db)).toBe(USER_DB_VERSION + 5);
    const after = await db.execute('PRAGMA user_version');
    expect(Number(after.rows[0]!['user_version'])).toBe(USER_DB_VERSION + 5);

    db.close();
  });

  it('numbers migrations contiguously from 2', () => {
    // Migration 1 is USER_DB_SCHEMA itself, applied on open. A gap or a
    // duplicate silently skips a table on exactly the devices that were on the
    // skipped version.
    expect(USER_DB_MIGRATIONS.map((m) => m.version)).toEqual(
      USER_DB_MIGRATIONS.map((_, i) => i + 2),
    );
    expect(USER_DB_VERSION).toBe(USER_DB_MIGRATIONS.length + 1);
  });

  it('declares one statement per migration entry', () => {
    // Both drivers execute a single statement: libsql's execute rejects the
    // rest, and the mobile client routes through expo's getAllAsync, which
    // prepares one. A migration written as one multi-statement string would
    // create its first table and silently skip the others.
    for (const migration of USER_DB_MIGRATIONS) {
      for (const statement of migration.statements) {
        expect(statement.replace(/;\s*$/, '')).not.toContain(';');
      }
    }
  });
});
