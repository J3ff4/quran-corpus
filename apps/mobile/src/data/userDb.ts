import * as SQLite from 'expo-sqlite';
import type * as ExpoFileSystemLegacy from 'expo-file-system/legacy';
import { USER_DB_SCHEMA, migrateUserDb } from '@quran-corpus/data/user-db';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';

// From openCorpusDb because that is where the corpus-extract cleanup lives and
// has to know which file to leave alone. One constant, so a rename here can
// never quietly re-arm that deletion.
import { userDbFileName as USER_DB_NAME } from './openCorpusDb';

// Memoized for the process, mirroring openCorpusDb. Every bookmark toggle and
// every reading-position write called this, so each one reopened the database
// and re-ran the whole DDL block; reading positions come off scroll, so that
// was several redundant opens a second. Callers keep calling openUserDb() as
// before -- fixing it here covers all of them, including the ones added later.
let connection: Promise<SQLite.SQLiteDatabase> | null = null;

export function openUserDb(): Promise<SQLite.SQLiteDatabase> {
  // Do not cache a failure: a transient open error would otherwise poison
  // every later call for the lifetime of the process.
  connection ??= createUserDb().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

// Opening is expo-sqlite's job and stays here; the schema it applies is not
// ours to define -- it comes from packages/data so the app and any other
// consumer of the user DB cannot disagree about its shape.
async function createUserDb() {
  const probe = resolveFileSystem();
  // Before the open, because openDatabaseAsync CREATES the file: once it has
  // run there is nothing left to tell a restored device from a fresh one.
  if (probe) await restoreIfMissing(probe.fileSystem, probe.sqliteDir, probe.backupDir);
  const db = await SQLite.openDatabaseAsync(USER_DB_NAME);
  await db.execAsync(USER_DB_SCHEMA);
  // Inside the memoized open, so it runs exactly once per process and every
  // caller of openUserDb() is guaranteed a migrated file -- there is no
  // "call this first" ordering for a screen to get wrong.
  await migrateUserDb(createExpoSqliteClient(db as ExpoSqliteLike));
  if (probe) await backUp(db, probe.fileSystem, probe.sqliteDir, probe.backupDir);
  return db;
}

/** Resolved at call time, and never fatally: the diagnostic below is the only
 *  caller, and a module that fails to load must cost a log line rather than
 *  the database open it was describing. (It also keeps expo-file-system out of
 *  this module's import graph, which is what lets the existing tests open a
 *  user DB without a filesystem at all.) */
function resolveFileSystem(): {
  fileSystem: UserDbFileSystem;
  sqliteDir: string;
  backupDir: string;
} | null {
  try {
    const FileSystem = require('expo-file-system/legacy') as typeof ExpoFileSystemLegacy;
    return {
      fileSystem: FileSystem,
      sqliteDir: `${FileSystem.documentDirectory}SQLite`,
      // NOT inside SQLite/. Whatever emptied the user DB on 2026-09-21 (#96)
      // was never identified, so the backup is only worth having if it is
      // somewhere the same event would not reach -- and the extract cleanup
      // in openCorpusDb only ever walks the SQLite directory.
      backupDir: `${FileSystem.documentDirectory}backups`,
    };
  } catch {
    return null;
  }
}

/** The slice of expo-file-system the check below needs, declared rather than
 *  imported so a test can hand it a directory that does not exist on any
 *  disk -- the same shape openCorpusDb uses, for the same reason. */
export interface UserDbFileProbe {
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  readDirectoryAsync(uri: string): Promise<string[]>;
}

/** The probe plus what it takes to move a database around. Split because
 *  reportIfBrandNew only ever looks -- asking it for write methods it does not
 *  call would force every caller, tests included, to supply four functions to
 *  satisfy a function that reads two. */
export interface UserDbFileSystem extends UserDbFileProbe {
  makeDirectoryAsync(uri: string, options: { intermediates: boolean }): Promise<void>;
  copyAsync(options: { from: string; to: string }): Promise<void>;
  moveAsync(options: { from: string; to: string }): Promise<void>;
  deleteAsync(uri: string, options: { idempotent: boolean }): Promise<void>;
}

/** The subset of the open database the backup needs. Declared, not imported,
 *  so a test can drive it without expo-sqlite. */
export interface CheckpointableDb {
  execAsync(sql: string): Promise<unknown>;
  getAllAsync(sql: string): Promise<unknown[]>;
}

const BACKUP_NAME = `${USER_DB_NAME}.backup`;
const STAGING_SUFFIX = '.partial';

/**
 * Say so, loudly, when this process is about to CREATE the user database
 * rather than open one that was already there.
 *
 * On 2026-09-21 the owner's bookmarks, notes, reading history and settings
 * were found gone on a device the app had been running on for three weeks
 * (#96). The install was ruled out, the extract cleanup was ruled out, and the
 * app's own logs said nothing either way -- because opening a database that
 * does not exist and opening one that does look identical from here. A
 * first-ever launch prints this once and never again; any other time it
 * prints, something removed a file that is meant to outlive app updates, and
 * the directory listing beside it says what else went with it.
 *
 * Diagnostic only, and it never throws: a logging path that can break the open
 * it is describing would be worse than the blind spot it fills.
 */
export async function reportIfBrandNew(
  fileSystem: UserDbFileProbe,
  sqliteDir: string,
): Promise<void> {
  try {
    const info = await fileSystem.getInfoAsync(`${sqliteDir}/${USER_DB_NAME}`);
    if (info.exists) return;
    const siblings = await fileSystem.readDirectoryAsync(sqliteDir).catch(() => ['<unreadable>']);
    console.warn(
      `[user db] creating a NEW ${USER_DB_NAME} -- if this device has run the app before, ` +
        `bookmarks, notes, history and settings have just been lost. ` +
        `${sqliteDir} holds: ${siblings.join(', ') || '<empty>'}`,
    );
  } catch (cause) {
    console.warn('[user db] could not check whether the database already existed', cause);
  }
}

/**
 * Put the backup back when the database it copies has gone missing.
 *
 * Runs BEFORE the open, because `openDatabaseAsync` creates the file it cannot
 * find -- after that, a wiped device and a new one are the same device. If
 * there is no backup, or the database is still there, this does nothing and
 * the app opens what it always opens.
 *
 * The owner lost three weeks of bookmarks, notes, history and settings on
 * 2026-09-21 and nothing has ever explained it (#96): the install, the extract
 * cleanup, storage pressure and the app's own write path were each ruled out,
 * and the owner did not clear the data. Until the cause is known, the only
 * honest protection is a copy somewhere the same event did not reach.
 */
export async function restoreIfMissing(
  fileSystem: UserDbFileSystem,
  sqliteDir: string,
  backupDir: string,
): Promise<boolean> {
  try {
    const live = `${sqliteDir}/${USER_DB_NAME}`;
    if ((await fileSystem.getInfoAsync(live)).exists) return false;

    const backup = `${backupDir}/${BACKUP_NAME}`;
    if (!(await fileSystem.getInfoAsync(backup)).exists) {
      // A first-ever launch looks exactly like this, so it is not a warning on
      // its own -- reportIfBrandNew says whether it should have been.
      await reportIfBrandNew(fileSystem, sqliteDir);
      return false;
    }

    await fileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
    // Staged and renamed, as the corpus extract is: a half-copied database is
    // byte-for-byte a whole one as far as the next launch can tell.
    const staging = `${live}${STAGING_SUFFIX}`;
    await fileSystem.deleteAsync(staging, { idempotent: true });
    await fileSystem.copyAsync({ from: backup, to: staging });
    await fileSystem.moveAsync({ from: staging, to: live });
    console.warn(
      `[user db] ${USER_DB_NAME} was missing and has been RESTORED from ${backup}. ` +
        `Anything saved since the last backup is not in it.`,
    );
    return true;
  } catch (cause) {
    // The open is the point; the restore is insurance. A failed restore must
    // not take the app down with it.
    console.warn('[user db] could not restore from backup', cause);
    return false;
  }
}

/**
 * Refresh the backup from the open database -- but never with an empty one.
 *
 * That guard is the whole design. A backup that faithfully mirrored the live
 * file would have copied the wipe over the only good copy within seconds of
 * the next launch, which is worse than no backup at all: it would look like
 * protection while guaranteeing the loss. So an empty database never
 * overwrites a backup that has rows in it.
 *
 * WAL is checkpointed first. expo-sqlite opens in WAL mode, so recent writes
 * live in `-wal` until a checkpoint folds them in, and copying the `.db` alone
 * would back up a database missing exactly the newest bookmarks.
 */
export async function backUp(
  db: CheckpointableDb,
  fileSystem: UserDbFileSystem,
  sqliteDir: string,
  backupDir: string,
): Promise<boolean> {
  const backup = `${backupDir}/${BACKUP_NAME}`;
  try {
    if ((await countUserRows(db)) === 0) {
      if ((await fileSystem.getInfoAsync(backup)).exists) {
        console.warn(
          '[user db] the database is empty and a backup exists -- keeping the backup. ' +
            'If this is not a fresh install, something removed the live database.',
        );
      }
      return false;
    }

    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    await fileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
    const staging = `${backup}${STAGING_SUFFIX}`;
    await fileSystem.deleteAsync(staging, { idempotent: true });
    await fileSystem.copyAsync({ from: `${sqliteDir}/${USER_DB_NAME}`, to: staging });
    await fileSystem.moveAsync({ from: staging, to: backup });
    return true;
  } catch (cause) {
    console.warn('[user db] could not refresh the backup', cause);
    return false;
  }
}

/** Rows a reader would miss if they vanished. `settings` is in here on
 *  purpose: a reading language and a reciter are choices someone made. */
async function countUserRows(db: CheckpointableDb): Promise<number> {
  const rows = (await db.getAllAsync(
    `SELECT (SELECT count(*) FROM bookmarks)
          + (SELECT count(*) FROM reading_history)
          + (SELECT count(*) FROM settings) AS total`,
  )) as Array<{ total?: number }>;
  return rows[0]?.total ?? 0;
}
