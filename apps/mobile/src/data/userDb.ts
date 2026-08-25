import * as SQLite from 'expo-sqlite';
import { USER_DB_SCHEMA, migrateUserDb } from '@quran-corpus/data/user-db';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';

const USER_DB_NAME = 'quran-corpus-user.db';

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
  const db = await SQLite.openDatabaseAsync(USER_DB_NAME);
  await db.execAsync(USER_DB_SCHEMA);
  // Inside the memoized open, so it runs exactly once per process and every
  // caller of openUserDb() is guaranteed a migrated file -- there is no
  // "call this first" ordering for a screen to get wrong.
  await migrateUserDb(createExpoSqliteClient(db as ExpoSqliteLike));
  return db;
}
