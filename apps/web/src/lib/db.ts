import { createDatabase, runMigrations, backfillSearchIndex } from '@quran-corpus/data';
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
    const p = (async () => {
      const db = createDatabase(url);
      if (shouldRunMigrations()) {
        await runMigrations(db);
        await backfillSearchIndex(db);
      }
      return db;
    })();
    // Drop a failed init from the cache so the next request retries instead of
    // every request replaying the same rejected promise until process restart
    // (e.g. a transient DB error during cold-start migration). Guarded so a
    // later successful re-init is never clobbered. Callers still see the
    // rejection — this handler observes p, it doesn't replace it.
    p.catch(() => {
      if (_dbPromise === p) _dbPromise = null;
    });
    _dbPromise = p;
  }
  return _dbPromise;
}
