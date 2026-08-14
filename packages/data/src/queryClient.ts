// The structural minimum every read query in this package actually uses.
//
// Query functions used to take the full libsql `Client`, which drags in batch,
// transaction, sync, migrate and close — none of which they call. That forced
// every non-libsql caller to lie to the type system: apps/mobile passed its
// expo-sqlite client through `client as never` three times, and a cast to
// `never` disables checking on the one seam where the two drivers have to
// agree. Narrowing the parameter to what the queries touch lets both drivers
// satisfy it honestly, and `Client` still structurally satisfies QueryClient,
// so apps/web is unaffected.
//
// Anything that writes (db.ts, migrate.ts, backfills) keeps taking `Client`:
// this type is deliberately read-only, and widening it would hand the mobile
// entry point a write path it must not have.

/** A bind parameter. Deliberately the *intersection* of what libsql and
 *  expo-sqlite accept, not the union: the corpus schema binds only ints and
 *  text, and admitting bigint or a blob here would make expo-sqlite's narrower
 *  SQLiteBindValue fail to satisfy this contract for a case no query uses. */
export type QueryArg = string | number | boolean | null;

/** A result row, addressed by column name. Both drivers return name-keyed rows. */
export interface QueryRow {
  [column: string]: unknown;
}

// `args` is required, not optional, and that is load-bearing: libsql types
// Client.execute as a *property* rather than a method, so TS checks it under
// strict contravariance instead of the usual method bivariance. Its InStatement
// requires args on the object form, so an optional args here makes Client fail
// to satisfy QueryClient and breaks every apps/web call site. Pass the string
// form when there are no parameters.
export interface QueryClient {
  execute(statement: string | { sql: string; args: QueryArg[] }): Promise<{ rows: QueryRow[] }>;
}
