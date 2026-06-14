import { createDatabase, runMigrations } from '@quran-corpus/data';
import type { Client } from '@quran-corpus/data';

let _dbPromise: Promise<Client> | null = null;

// Migrations run at most once per process (the promise is memoized). Against a
// pre-provisioned database (e.g. a managed Turso instance) set
// DB_SKIP_MIGRATIONS=true so the DDL never runs in the request path.
function shouldRunMigrations(): boolean {
  return process.env['DB_SKIP_MIGRATIONS'] !== 'true';
}

export function getDatabase(): Promise<Client> {
  if (_dbPromise == null) {
    const url = process.env['DATABASE_URL'] ?? 'file:quran.db';
    _dbPromise = (async () => {
      const db = createDatabase(url);
      if (shouldRunMigrations()) {
        await runMigrations(db);
      }
      return db;
    })();
  }
  return _dbPromise;
}
