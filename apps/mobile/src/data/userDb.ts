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
  if (probe) await reportIfBrandNew(probe.fileSystem, probe.sqliteDir);
  const db = await SQLite.openDatabaseAsync(USER_DB_NAME);
  await db.execAsync(USER_DB_SCHEMA);
  // Inside the memoized open, so it runs exactly once per process and every
  // caller of openUserDb() is guaranteed a migrated file -- there is no
  // "call this first" ordering for a screen to get wrong.
  await migrateUserDb(createExpoSqliteClient(db as ExpoSqliteLike));
  return db;
}

/** Resolved at call time, and never fatally: the diagnostic below is the only
 *  caller, and a module that fails to load must cost a log line rather than
 *  the database open it was describing. (It also keeps expo-file-system out of
 *  this module's import graph, which is what lets the existing tests open a
 *  user DB without a filesystem at all.) */
function resolveFileSystem(): { fileSystem: UserDbFileSystem; sqliteDir: string } | null {
  try {
    const FileSystem = require('expo-file-system/legacy') as typeof ExpoFileSystemLegacy;
    return { fileSystem: FileSystem, sqliteDir: `${FileSystem.documentDirectory}SQLite` };
  } catch {
    return null;
  }
}

/** The slice of expo-file-system the check below needs, declared rather than
 *  imported so a test can hand it a directory that does not exist on any
 *  disk -- the same shape openCorpusDb uses, for the same reason. */
export interface UserDbFileSystem {
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  readDirectoryAsync(uri: string): Promise<string[]>;
}

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
  fileSystem: UserDbFileSystem,
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
