import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Client } from '@libsql/client';

export async function runMigrations(db: Client): Promise<void> {
  const schemaUrl = new URL('../schema.sql', import.meta.url);
  const sql = readFileSync(fileURLToPath(schemaUrl), 'utf-8');

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('PRAGMA'));

  for (const statement of statements) {
    await db.execute(statement);
  }
}
