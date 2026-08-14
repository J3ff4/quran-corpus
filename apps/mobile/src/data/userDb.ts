import * as SQLite from 'expo-sqlite';

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

async function createUserDb() {
  const db = await SQLite.openDatabaseAsync(USER_DB_NAME);
  await db.execAsync(`
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
  `);
  return db;
}
