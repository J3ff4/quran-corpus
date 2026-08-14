import * as SQLite from 'expo-sqlite';

const USER_DB_NAME = 'quran-corpus-user.db';

export async function openUserDb() {
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
