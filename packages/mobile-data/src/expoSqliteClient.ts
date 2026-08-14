import type { QueryClient } from '@quran-corpus/data/mobile';

export type SqlValue = string | number | boolean | null;
export type MobileRow = Record<string, SqlValue>;

export interface ExpoSqliteLike {
  getAllAsync<T extends MobileRow>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

/** The read contract packages/data queries take. Aliased rather than redeclared:
 *  when this was a separate-but-parallel interface the two drifted, and
 *  apps/mobile bridged the gap with `client as never` on every call. */
export type MobileDataClient = QueryClient;

export function createExpoSqliteClient(db: ExpoSqliteLike): MobileDataClient {
  return {
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);
      const rows = await db.getAllAsync<MobileRow>(sql, args);
      return { rows };
    },
  };
}
