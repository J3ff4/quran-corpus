import { describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db.js';
import type { QueryClient } from '../src/queryClient.js';
import {
  USER_DB_MIGRATIONS,
  USER_DB_SCHEMA,
  USER_DB_VERSION,
  countDistinctRootsViewed,
  getBookmarks,
  getReadingDays,
  getRootViewsByDay,
  NOTE_MAX_LENGTH,
  isIsoDay,
  migrateUserDb,
  normalizeNote,
  recordReadingDay,
  recordReadingPosition,
  recordRootView,
  setBookmark,
  setBookmarkNote,
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
    expect(await getBookmarks(db)).toEqual([
      { surahId: 2, ayahNumber: 255, note: null, createdAt: expect.any(String) },
    ]);

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


/** A migrated in-memory user DB -- the two tables under test only exist after
 *  the migration, so every case below needs both steps. */
async function migratedUserDb() {
  const db = memoryUserDb();
  await db.executeMultiple(USER_DB_SCHEMA);
  await migrateUserDb(db);
  return db;
}

describe('isIsoDay', () => {
  it('returns false for an impossible date rather than throwing', () => {
    // `new Date('2026-13-01T00:00:00Z')` is an Invalid Date, and calling
    // toISOString() on one throws RangeError. A predicate that throws is not a
    // predicate: `if (isIsoDay(x))` would crash on exactly the input it exists
    // to reject, and the recordReadingDay tests below cannot see the difference
    // because they expect a RangeError either way.
    expect(isIsoDay('2026-13-01')).toBe(false);
    expect(isIsoDay('2026-00-10')).toBe(false);
    expect(isIsoDay('2026-08-32')).toBe(false);
  });

  it('returns false for a date that rolls over into the next month', () => {
    // These parse fine and come back as a *different* day, so only the
    // round-trip comparison catches them.
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('2026-04-31')).toBe(false);
  });

  it('accepts a real calendar day, leap day included', () => {
    expect(isIsoDay('2026-08-24')).toBe(true);
    expect(isIsoDay('2024-02-29')).toBe(true);
    expect(isIsoDay('2026-02-28')).toBe(true);
  });
});

describe('reading days', () => {
  it('rejects anything that is not an ISO day', async () => {
    const db = await migratedUserDb();
    const { proxy, statements } = recordingProxy(db);

    // The write boundary for a shared API. `day` is a PRIMARY KEY, so a junk
    // value is not a bad row that gets overwritten tomorrow -- it is a
    // permanent extra row that inflates the streak for ever.
    for (const bad of [
      '2026-8-24',
      '24/08/2026',
      '2026-13-01',
      '2026-02-30',
      '',
      'today',
      '2026-08-24T10:00:00Z',
    ]) {
      await expect(recordReadingDay(proxy, bad)).rejects.toThrow(RangeError);
    }
    // Rejected means no statement at all, not a statement that happens to be
    // harmless -- the row would be permanent if one got through.
    expect(statements).toEqual([]);

    db.close();
  });

  it('is idempotent for a day already recorded', async () => {
    const db = await migratedUserDb();

    await recordReadingDay(db, '2026-08-24');
    await recordReadingDay(db, '2026-08-24');

    // Fires on every scroll of the reader. A non-idempotent insert either
    // throws on the second ayah or counts one day many times.
    expect(await getReadingDays(db, '2026-08-01')).toEqual(['2026-08-24']);

    db.close();
  });

  it('returns days from the cutoff onward, newest first', async () => {
    const db = await migratedUserDb();

    for (const day of ['2026-08-20', '2026-08-22', '2026-08-24']) {
      await recordReadingDay(db, day);
    }

    expect(await getReadingDays(db, '2026-08-22')).toEqual(['2026-08-24', '2026-08-22']);

    db.close();
  });

  it('rejects a cutoff that is not an ISO day', async () => {
    const db = await migratedUserDb();

    // Same boundary on the read side: an unvalidated cutoff is compared as
    // text, so 'today' silently returns every row ever written.
    await expect(getReadingDays(db, 'today')).rejects.toThrow(RangeError);

    db.close();
  });
});

describe('root views', () => {
  it('rejects a root id that cannot name a root', async () => {
    const db = await migratedUserDb();
    const { proxy, statements } = recordingProxy(db);

    for (const bad of [0, -1, 1.5, Number.NaN, 99999]) {
      await expect(recordRootView(proxy, bad, '2026-08-24')).rejects.toThrow(RangeError);
    }
    await expect(recordRootView(proxy, 12, 'yesterday')).rejects.toThrow(RangeError);
    expect(statements).toEqual([]);

    db.close();
  });

  it('counts a root once however many times it is opened', async () => {
    const db = await migratedUserDb();

    await recordRootView(db, 12, '2026-08-24');
    await recordRootView(db, 12, '2026-08-24');
    await recordRootView(db, 12, '2026-08-25');
    await recordRootView(db, 99, '2026-08-25');

    // "Distinct roots studied", not "root screens opened". Re-reading one root
    // all week is one root.
    expect(await countDistinctRootsViewed(db)).toBe(2);
    expect(await getRootViewsByDay(db, '2026-08-24')).toEqual([
      { day: '2026-08-25', roots: 2 },
      { day: '2026-08-24', roots: 1 },
    ]);

    db.close();
  });

  it('counts nothing on a file where no root has been opened', async () => {
    const db = await migratedUserDb();

    // COUNT over no rows returns one row holding 0, but a driver that returned
    // no row at all would make this NaN and render as a blank counter.
    expect(await countDistinctRootsViewed(db)).toBe(0);
    expect(await getRootViewsByDay(db, '2026-08-24')).toEqual([]);

    db.close();
  });
});


describe('normalizeNote', () => {
  it('trims and keeps ordinary text', () => {
    expect(normalizeNote('  a note about 2:255  ')).toBe('a note about 2:255');
  });

  it('treats an empty or whitespace-only note as no note', () => {
    // Otherwise "clear the note" writes a row the With-notes tab then lists as
    // a note with nothing in it.
    for (const blank of ['', '   ', '\n\t ', null, undefined]) {
      expect(normalizeNote(blank)).toBeNull();
    }
  });

  it('caps at 500 characters', () => {
    expect(normalizeNote('x'.repeat(600))).toHaveLength(NOTE_MAX_LENGTH);
  });

  it('caps after trimming, so padding cannot eat the allowance', () => {
    // LEADING padding, deliberately. Trailing padding proves nothing: slicing
    // before the trim still leaves 500 characters once the tail is cut, so the
    // assertion passes either way. Five leading spaces are what a cap applied
    // in the wrong order actually eats -- it would return 495.
    expect(normalizeNote(`     ${'x'.repeat(500)}`)).toHaveLength(NOTE_MAX_LENGTH);
  });

  it('strips control characters but keeps Arabic, Cyrillic and newlines', () => {
    // Plain text (decision 30). A note renders straight into a <Text>, so this
    // is not an escaping problem -- it is about not persisting bytes that make
    // the row unreadable, or unsearchable if the column is ever indexed.
    expect(normalizeNote('note\u0007here')).toBe('notehere');
    expect(normalizeNote('Заметка ملاحظة')).toBe('Заметка ملاحظة');
    expect(normalizeNote('line one\nline two')).toBe('line one\nline two');
  });

  it('refuses a non-string that is not null', () => {
    for (const bad of [42, {}, [], true]) {
      expect(() => normalizeNote(bad as never)).toThrow(TypeError);
    }
  });
});

describe('setBookmarkNote', () => {
  it('validates the coordinate like every other write', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);
    await migrateUserDb(db);

    // al-Fatiha has 7 ayahs. 286 is al-Baqara's count, and the row would store
    // cleanly and then open nothing.
    await expect(setBookmarkNote(db, 1, 286, 'x')).rejects.toThrow(RangeError);

    db.close();
  });

  it('does not create a bookmark that does not exist', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);
    await migrateUserDb(db);

    await setBookmarkNote(db, 2, 255, 'orphan');
    // A note is an attribute of a bookmark. Writing one for an unbookmarked
    // ayah would make it invisible in every tab and undeletable from the UI.
    expect(await getBookmarks(db)).toEqual([]);

    db.close();
  });

  it('round-trips a note on an existing bookmark', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);
    await migrateUserDb(db);
    await setBookmark(db, 2, 255, true);

    await setBookmarkNote(db, 2, 255, '  the throne verse  ');

    expect(await getBookmarks(db)).toEqual([
      { surahId: 2, ayahNumber: 255, note: 'the throne verse', createdAt: expect.any(String) },
    ]);

    db.close();
  });

  it('clears a note without removing the bookmark', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);
    await migrateUserDb(db);
    await setBookmark(db, 2, 255, true);
    await setBookmarkNote(db, 2, 255, 'temp');

    await setBookmarkNote(db, 2, 255, null);

    expect(await getBookmarks(db)).toEqual([
      { surahId: 2, ayahNumber: 255, note: null, createdAt: expect.any(String) },
    ]);

    db.close();
  });
});

describe('migration 3 — the note column', () => {
  it('adds the column to a populated pre-migration file without touching the rows', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);
    // The owner's real data, written by the shipped build.
    await setBookmark(db, 2, 255, true);
    await db.execute('PRAGMA user_version = 2');

    await migrateUserDb(db);

    expect(await getBookmarks(db)).toEqual([
      { surahId: 2, ayahNumber: 255, note: null, createdAt: expect.any(String) },
    ]);
    // ALTER TABLE ADD COLUMN is the one statement in this file that is NOT
    // idempotent -- it throws `duplicate column name` on a second run. This is
    // what the version gate is for, and why migrateUserDb must never be made to
    // swallow an error.
    await expect(migrateUserDb(db)).resolves.toBe(USER_DB_VERSION);

    db.close();
  });

  it('leaves an older build able to read the migrated file', async () => {
    const db = memoryUserDb();
    await db.executeMultiple(USER_DB_SCHEMA);
    await migrateUserDb(db);

    // Additive only: no UPDATE, no rebuild-and-copy, no DROP, and the new
    // column is nullable. A build that predates migration 3 selects the columns
    // it knows about and still gets its row. The user DB lives on a phone and
    // survives app updates, so a downgrade is a real path.
    await setBookmark(db, 2, 255, true);
    const old = await db.execute('SELECT surah_id, ayah_number FROM bookmarks');
    expect(old.rows).toHaveLength(1);

    db.close();
  });
});
