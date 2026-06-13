import { createDatabase, runMigrations } from '@quran-corpus/data';
import type { Client } from '@quran-corpus/data';

let _dbPromise: Promise<Client> | null = null;

export function getDatabase(): Promise<Client> {
  if (_dbPromise == null) {
    const url = process.env['DATABASE_URL'] ?? 'file:quran.db';
    _dbPromise = (async () => {
      const db = createDatabase(url);
      await runMigrations(db);
      return db;
    })();
  }
  return _dbPromise;
}
