import {
  createDatabase,
  runMigrations,
  backfillSearchIndex,
  normalizeArabicJoinKeys,
  backfillRootSortOrderIfStale,
} from '@quran-corpus/data';
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
        // Inside the guard, unlike normalizeArabicJoinKeys below, because this one
        // is not self-contained: what marks the cache dirty is the
        // trg_roots_sort_order_* DDL that runMigrations installs. Under
        // DB_SKIP_MIGRATIONS=true those triggers never exist, so nothing ever
        // nulls a rank, the probe finds none, and running it would only
        // pretend to heal while stale ranks were served. It also keeps the
        // build (which sets that flag) from issuing a full-table write against
        // the live database it is only supposed to read.
        //
        // Never fatal: this is a cache warm-up and getRootNeighbors is correct
        // without it, falling back to the full sort. Letting it reject would
        // fail the memoized init and 500 every SSR page over a slow sort — and
        // SQLITE_BUSY is expected here whenever the scraper holds the write
        // lock on the same file.
        try {
          await backfillRootSortOrderIfStale(db);
        } catch (err) {
          console.warn('root sort_order backfill skipped; using the full-sort fallback', err);
        }
      }
      // Data-only self-heal (idempotent UPDATE, no DDL, no schema dependency)
      // -- runs even when DB_SKIP_MIGRATIONS=true, since that flag's job is
      // only to keep DDL out of the request path against a pre-provisioned
      // database, not to exempt it from data corrections.
      await normalizeArabicJoinKeys(db);
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
