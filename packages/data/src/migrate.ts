import type { Client } from '@libsql/client';
import { SCHEMA_SQL } from './schema.generated.js';

// SQLite trigger bodies contain inner semicolons inside BEGIN…END, so a naive
// `.split(';')` shreds them. Split on top-level semicolons only, tracking
// BEGIN/END depth so a whole trigger stays one statement.
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let depth = 0;
  let lastIndex = 0;
  const re = /\bBEGIN\b|\bEND\b|;/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    current += sql.slice(lastIndex, match.index) + match[0];
    lastIndex = re.lastIndex;
    const token = match[0].toUpperCase();
    if (token === 'BEGIN') {
      depth++;
    } else if (token === 'END') {
      if (depth > 0) depth--;
    } else if (depth === 0) {
      // top-level ';'
      statements.push(current);
      current = '';
    }
  }
  current += sql.slice(lastIndex);
  if (current.trim().length > 0) statements.push(current);
  return statements;
}

// ponytail: strips `--` to end-of-line comments before splitting. Safe
// because schema.sql is trusted DDL with no string literals containing `--`;
// splitStatements above is likewise not quote-aware for BEGIN/END/`;` inside
// string literals — same trusted-DDL ceiling. If schema.sql ever needs
// comments/strings containing these characters, make both quote-aware.
export function stripLineComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

// `CREATE TABLE IF NOT EXISTS` is a no-op against a `words` table that
// already exists without this column (a pre-provisioned DB, or a legacy
// snapshot opened before the scraper's own migration ran). Self-heal it here
// too, mirroring packages/scraper's _migrate_add_word_columns, so any
// consumer of this package — not just the scraper — gets the column.
async function migrateAddWordColumns(db: Client): Promise<void> {
  const info = await db.execute('PRAGMA table_info(words)');
  const existing = new Set(info.rows.map((r) => r['name'] as string));
  if (!existing.has('grammar_note')) {
    await db.execute('ALTER TABLE words ADD COLUMN grammar_note TEXT');
  }
}

export async function runMigrations(db: Client): Promise<void> {
  const statements = splitStatements(stripLineComments(SCHEMA_SQL))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('PRAGMA'));

  for (const statement of statements) {
    await db.execute(statement);
  }

  await migrateAddWordColumns(db);
}
