import { createDatabase, runMigrations } from '@quran-corpus/data';
import type { Client } from '@quran-corpus/data';

let _db: Client | null = null;

export async function getDatabase(): Promise<Client> {
  if (_db == null) {
    const url = process.env['DATABASE_URL'] ?? 'file:quran.db';
    _db = createDatabase(url);
    await runMigrations(_db);
  }
  return _db;
}
