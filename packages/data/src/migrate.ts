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

// Built from an explicit codepoint sequence, not a hand-typed literal --
// this pair (base alef + combining maddah above) is visually
// indistinguishable from its precomposed form in an editor/diff.
const DECOMPOSED_ALEF_MADDA = String.fromCodePoint(0x0627, 0x0653);

// The corpus morphology import (packages/scraper) sometimes wrote alef-madda
// as this decomposed sequence, while root_forms.form_arabic (a separate
// import pipeline) always uses the precomposed form (U+0622) -- breaking
// exact-string joins between them (the root/dictionary concordance's
// derived-form filter). packages/scraper's buckwalter.py now NFC-normalizes
// new conversions at the source, but any database that was already
// populated before that fix needs the existing rows composed too. Exported
// standalone (not run from runMigrations) so callers can self-heal this data
// fix even in a DB_SKIP_MIGRATIONS=true deployment that intentionally skips
// runMigrations' schema DDL against a pre-provisioned database -- see
// apps/web/src/lib/db.ts, the only real caller.
export async function normalizeLemmaMadda(db: Client): Promise<void> {
  for (const table of ['words', 'word_segments'] as const) {
    const candidates = await db.execute({
      sql: `SELECT id, lemma FROM ${table} WHERE lemma LIKE '%' || ? || '%'`,
      args: [DECOMPOSED_ALEF_MADDA],
    });
    for (const row of candidates.rows) {
      const fixed = (row['lemma'] as string).normalize('NFC');
      if (fixed !== row['lemma']) {
        await db.execute({
          sql: `UPDATE ${table} SET lemma = ? WHERE id = ?`,
          args: [fixed, row['id'] as number],
        });
      }
    }
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
