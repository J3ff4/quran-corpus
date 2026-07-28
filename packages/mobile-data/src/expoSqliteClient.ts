export type SqlValue = string | number | boolean | null;
export type MobileRow = Record<string, SqlValue>;

export interface ExpoSqliteLike {
  getAllAsync<T extends MobileRow>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

export interface MobileDataClient {
  execute(statement: string | { sql: string; args?: SqlValue[] }): Promise<{ rows: MobileRow[] }>;
}

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
