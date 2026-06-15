// Generates src/schema.generated.ts from schema.sql so the schema DDL is embedded
// as a string at build time. This keeps schema.sql the single editable source of
// truth (DRY) while making packages/data free of any runtime filesystem reads —
// so it stays bundler-safe (Next/webpack) and portable to non-Node targets
// (e.g. future apps/mobile) per CLAUDE.md §3.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const sql = readFileSync(join(root, 'schema.sql'), 'utf-8');

const banner =
  '// AUTO-GENERATED from schema.sql by scripts/generate-schema.mjs — do not edit by hand.\n' +
  '// Run `pnpm --filter @quran-corpus/data build` (or generate:schema) to regenerate.\n';

const contents = `${banner}export const SCHEMA_SQL = ${JSON.stringify(sql)};\n`;

writeFileSync(join(root, 'src', 'schema.generated.ts'), contents, 'utf-8');
process.stdout.write('Generated src/schema.generated.ts from schema.sql\n');
