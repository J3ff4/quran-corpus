import type { Client, InStatement } from '@libsql/client';
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

// Built from explicit codepoint sequences, never hand-typed literals: each of
// these is visually indistinguishable from the alternative it is here to tell
// apart, in an editor and in a diff. That is precisely how the mismatch below
// survived two import pipelines unnoticed.
const ALEF_MADDA = String.fromCodePoint(0x0622);
const DAGGER_ALEF_MADDA = String.fromCodePoint(0x0670, 0x0653);

// Every column the derived-form concordance filter compares by exact string
// equality -- it joins root_forms.form_arabic to word_segments.lemma (see
// queries/roots.ts). words.lemma travels with word_segments.lemma because the
// two are copies of one value and nothing else keeps them in step.
const JOIN_TEXT_COLUMNS = [
  ['words', 'lemma'],
  ['word_segments', 'lemma'],
  ['root_forms', 'form_arabic'],
] as const;

// Rows per write transaction in the pass below. Large enough that the first
// run is not thousands of separate commits, small enough that one chunk is not
// an unbounded transaction against a database the web app is reading.
const NFC_UPDATE_BATCH = 500;

/**
 * NFC-normalize every column that join compares.
 *
 * The two sides reach the database from different pipelines -- lemmas from
 * the corpus morphology file through packages/scraper's buckwalter.py, forms
 * from the root page's HTML through corpus_dictionary.py -- and
 * corpus.quran.com writes a shadda ahead of the vowel it sits with, where NFC
 * orders them the other way round (fatha is combining class 30, shadda 33).
 * The two strings render identically and compare unequal, so the chip counts
 * three occurrences and the filter finds none: root Hqq, form حَآقَّة (owner
 * report, 2026-08-27). 31 forms were dead this way.
 *
 * **Both sides in one pass, never one alone.** 1040 of the 4657 forms match
 * today only because form and lemma are non-NFC in the same way; normalizing
 * either column on its own breaks every one of them.
 *
 * Unscoped where this used to be LIKE-scoped to one decomposed sequence: that
 * scope is what left 12097 lemma rows un-normalized after the alef-madda fix
 * (PR #50) and hid this defect for a month. A predicate narrow enough to skip
 * rows cheaply is also narrow enough to skip rows wrongly, and it fails open --
 * the rows it misses are precisely the ones nobody knows to look for.
 *
 * That correctness is paid for, and the earlier draft of this comment
 * understated the bill. The LIKE version pushed its predicate into SQLite and,
 * once healed, transferred nothing; this reads all 153387 rows of the three
 * columns into JS -- measured at 408ms against the live corpus, inside the init
 * that blocks a cold process's first request. Accepted rather than optimized,
 * for two reasons: SQLite has no NFC function, so the detection cannot move
 * into SQL, and the obvious alternative -- a stored "already normalized"
 * marker -- has the same fail-open shape as the LIKE scope, since it would be
 * set on the word of the writer whose output this exists to check. apps/web is
 * a long-lived server process, so the cost is once per deploy. Somewhere that
 * cold-starts per request, this is the first thing to revisit.
 */
async function normalizeNfcJoinColumns(db: Client): Promise<void> {
  for (const [table, column] of JOIN_TEXT_COLUMNS) {
    const rows = await db.execute(
      `SELECT id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`,
    );
    const updates: InStatement[] = [];
    for (const row of rows.rows) {
      const raw = row['value'] as string;
      const fixed = raw.normalize('NFC');
      if (fixed === raw) continue;
      updates.push({
        sql: `UPDATE ${table} SET ${column} = ? WHERE id = ?`,
        args: [fixed, row['id'] as number],
      });
    }
    // Batched, not awaited one at a time. The first run against the live
    // corpus has ~25000 rows to compose, and as individual autocommits that
    // took over two minutes -- which apps/web would have paid inside its
    // memoized init, blocking the first request of a cold process. batch()
    // wraps each chunk in one transaction.
    for (let i = 0; i < updates.length; i += NFC_UPDATE_BATCH) {
      await db.batch(updates.slice(i, i + NFC_UPDATE_BATCH), 'write');
    }
  }
}

/**
 * Re-spell a form's alef-madda as the morphology's dagger-alef, but only where
 * that is what makes it match a real lemma of its own root.
 *
 * What is left after NFC is an orthographic disagreement, not a canonical one:
 * the root page spells طَآئِر with U+0622, the morphology file spells the same
 * word طَٰٓئِر with a superscript alef carrying a maddah. Unicode holds those
 * to be different words, so no normalization form will ever reconcile them --
 * one side has to be rewritten.
 *
 * Self-verifying rather than a blind fold: the rewrite only fires when the
 * re-spelled string is a lemma that actually occurs under that root, so a form
 * whose alef-madda is genuine (root Amm, آمِّين) is left exactly as scraped.
 * 14 forms qualify, and the spelling this moves them to is the one the other
 * 4608 forms already carry -- it makes the outliers consistent, not the
 * reverse. Owner call, 2026-08-27, on the display change that implies.
 *
 * Lives here rather than in the scraper because it cannot be fixed at the
 * source: the root page has no access to the morphology's spelling, and the
 * two are imported separately.
 */
async function foldFormMaddaToLemma(db: Client): Promise<void> {
  const candidates = await db.execute({
    sql: `SELECT rf.id, rf.form_arabic, r.root_buckwalter
            FROM root_forms rf
            JOIN roots r ON r.id = rf.root_id
           WHERE rf.form_arabic LIKE '%' || ? || '%'`,
    args: [ALEF_MADDA],
  });
  for (const row of candidates.rows) {
    const form = row['form_arabic'] as string;
    const folded = form.split(ALEF_MADDA).join(DAGGER_ALEF_MADDA).normalize('NFC');
    const found = await db.execute({
      sql: 'SELECT DISTINCT lemma FROM word_segments WHERE root = ? AND lemma IN (?, ?)',
      args: [row['root_buckwalter'] as string, form, folded],
    });
    const lemmas = new Set(found.rows.map((r) => r['lemma'] as string));
    // A form that already matches is not a mismatch to repair, whatever it is
    // spelled with -- and rewriting it would move it off a lemma it reaches.
    if (lemmas.has(form) || !lemmas.has(folded)) continue;
    await db.execute({
      sql: 'UPDATE root_forms SET form_arabic = ? WHERE id = ?',
      args: [folded, row['id'] as number],
    });
  }
}

/**
 * Repair the text the derived-form concordance filter joins on. Idempotent,
 * data-only, no DDL and no schema dependency.
 *
 * Exported standalone rather than called from runMigrations so a caller can
 * self-heal even under DB_SKIP_MIGRATIONS=true, which deliberately skips that
 * function's DDL against a pre-provisioned database -- see
 * apps/web/src/lib/db.ts, the only real caller. Greptile raised the same point
 * on PR #50 and it holds here: a repair that lives only in a scraper CLI
 * command leaves every deployed database broken until somebody remembers it.
 *
 * apps/mobile cannot run this -- it opens the bundled corpus PRAGMA
 * query_only. Its database is a copy of the canonical one, so healing the
 * canonical file and regenerating the bundle is what reaches the phone.
 */
export async function normalizeArabicJoinKeys(db: Client): Promise<void> {
  await normalizeNfcJoinColumns(db);
  // After the NFC pass, never before: this compares candidates against stored
  // lemmas, and an un-normalized lemma fails a comparison the pass above has
  // already fixed.
  await foldFormMaddaToLemma(db);
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
