import type { Client } from '@libsql/client';
import { SCHEMA_SQL } from './schema.generated.js';

export async function runMigrations(db: Client): Promise<void> {
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('PRAGMA'));

  for (const statement of statements) {
    await db.execute(statement);
  }
}
