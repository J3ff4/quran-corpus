import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '../src/db.js';
import {
  runMigrations,
  normalizeArabicJoinKeys,
  splitStatements,
  stripLineComments,
} from '../src/migrate.js';
import type { Client } from '@libsql/client';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
});

afterAll(() => db.close());

describe('runMigrations', () => {
  it('creates all six tables', async () => {
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = result.rows.map((r) => r['name'] as string);
    expect(names).toEqual(
      expect.arrayContaining([
        'ayahs',
        'languages',
        'surahs',
        'translations',
        'word_glosses',
        'words',
      ]),
    );
  });

  it('creates indexes', async () => {
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(4);
  });

  it('is idempotent — running twice does not error', async () => {
    await expect(runMigrations(db)).resolves.not.toThrow();
  });

  it('indexes word_segments.root (concordance lookup by segment root)', async () => {
    // Concordance queries match word_segments.root via EXISTS; without this
    // index that is a full scan of ~77k words on the force-dynamic root page.
    const idx = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_word_segments_root'",
    );
    expect(idx.rows).toHaveLength(1);
  });

  it('indexes roots.sort_order (O(1) neighbor lookup)', async () => {
    const idx = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_roots_sort_order'",
    );
    expect(idx.rows).toHaveLength(1);
  });

  it('creates dictionary + morphology-detail tables', async () => {
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    const names = new Set(
      (await d.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map(
        (r) => r['name'] as string,
      ),
    );
    for (const t of ['roots', 'root_forms', 'root_definitions', 'word_segments', 'word_concept_tags']) {
      expect(names.has(t)).toBe(true);
    }
    d.close();
  });

  it('adds verbatim + reserved columns to words', async () => {
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    const cols = new Set(
      (await d.execute('PRAGMA table_info(words)')).rows.map((r) => r['name'] as string),
    );
    for (const c of ['morphology_description', 'grammar_arabic', 'audio_url', 'grammar_note']) {
      expect(cols.has(c)).toBe(true);
    }
    d.close();
  });

  it('self-heals grammar_note onto a legacy words table missing it', async () => {
    const d = createDatabase('file::memory:');
    // Simulate a pre-existing DB whose `words` table predates this column —
    // `CREATE TABLE IF NOT EXISTS` alone would silently skip it.
    await d.execute(`CREATE TABLE words (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      ayah_id         INTEGER NOT NULL,
      position        INTEGER NOT NULL,
      text_arabic     TEXT    NOT NULL,
      transliteration TEXT,
      root            TEXT,
      lemma           TEXT,
      root_buckwalter TEXT,
      lemma_buckwalter TEXT,
      pos_tag         TEXT,
      morphology_json TEXT,
      morphology_description TEXT,
      grammar_arabic  TEXT,
      audio_url       TEXT,
      UNIQUE(ayah_id, position)
    )`);
    await runMigrations(d);
    const cols = new Set(
      (await d.execute('PRAGMA table_info(words)')).rows.map((r) => r['name'] as string),
    );
    expect(cols.has('grammar_note')).toBe(true);
    d.close();
  });

  // One fixture for the whole self-heal: a root whose forms reproduce each
  // case the join has to survive. `seedJoinFixture` returns the ids so a test
  // can assert on the row it cares about.
  async function seedJoinFixture(d: Client): Promise<void> {
    await d.execute("INSERT INTO surahs VALUES (1,'a','A','A','meccan',7,1)");
    await d.execute("INSERT INTO ayahs (id,surah_id,ayah_number,text_uthmani) VALUES (1,1,1,'x')");
    await d.execute("INSERT INTO roots (id,root_buckwalter,root_arabic,occurrence_count) VALUES (1,'Hqq','حقق',287)");
  }

  // Shadda (combining class 33) written ahead of fatha (30) -- the order
  // corpus.quran.com's HTML uses and NFC does not.
  const SHADDA = String.fromCodePoint(0x0651);
  const FATHA = String.fromCodePoint(0x064e);
  const ALEF_MADDA = String.fromCodePoint(0x0622);
  const DAGGER_ALEF_MADDA = String.fromCodePoint(0x0670, 0x0653);
  const scrapedOrder = `ح${FATHA}${ALEF_MADDA}ق${SHADDA}${FATHA}ة`;
  const nfcOrder = `ح${FATHA}${ALEF_MADDA}ق${FATHA}${SHADDA}ة`;

  async function addWord(d: Client, id: number, lemma: string, root: string): Promise<void> {
    await d.execute({
      sql: 'INSERT INTO words (id,ayah_id,position,text_arabic,lemma) VALUES (?,1,?,?,?)',
      args: [id, id, 'x', lemma],
    });
    await d.execute({
      sql: 'INSERT INTO word_segments (word_id,segment_index,lemma,root) VALUES (?,0,?,?)',
      args: [id, lemma, root],
    });
  }

  async function addForm(d: Client, id: number, formArabic: string): Promise<void> {
    await d.execute({
      sql: 'INSERT INTO root_forms (id,root_id,sort_order,pos_label,form_arabic,occurrence_count) VALUES (?,1,?,?,?,1)',
      args: [id, id, 'Noun', formArabic],
    });
  }

  it('normalizeArabicJoinKeys makes a non-NFC form match its NFC lemma', async () => {
    // Exercised directly, not through runMigrations: this is a data-only
    // self-heal, called standalone by apps/web/src/lib/db.ts so it still runs
    // under DB_SKIP_MIGRATIONS=true, which skips runMigrations' DDL.
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    await seedJoinFixture(d);
    await addWord(d, 1, nfcOrder, 'Hqq');
    await addForm(d, 10, scrapedOrder);

    // The defect itself: two strings that render the same and compare unequal.
    expect(scrapedOrder).not.toBe(nfcOrder);

    await normalizeArabicJoinKeys(d);

    const form = await d.execute('SELECT form_arabic FROM root_forms WHERE id = 10');
    expect(form.rows[0]!['form_arabic']).toBe(nfcOrder);
    const joined = await d.execute(
      'SELECT COUNT(*) AS n FROM root_forms rf JOIN word_segments ws ON ws.lemma = rf.form_arabic WHERE rf.id = 10',
    );
    expect(joined.rows[0]!['n']).toBe(1);
    d.close();
  });

  it('normalizeArabicJoinKeys normalizes lemma and form together, never one alone', async () => {
    // The trap in this repair: a form and a lemma that are BOTH stored in the
    // page's mark order match each other today. Normalizing either column on
    // its own would break 1040 live forms. Both sides move or neither does.
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    await seedJoinFixture(d);
    await addWord(d, 1, scrapedOrder, 'Hqq');
    await addForm(d, 10, scrapedOrder);

    await normalizeArabicJoinKeys(d);

    const form = await d.execute('SELECT form_arabic FROM root_forms WHERE id = 10');
    const seg = await d.execute('SELECT lemma FROM word_segments WHERE word_id = 1');
    const word = await d.execute('SELECT lemma FROM words WHERE id = 1');
    expect(form.rows[0]!['form_arabic']).toBe(nfcOrder);
    expect(seg.rows[0]!['lemma']).toBe(nfcOrder);
    expect(word.rows[0]!['lemma']).toBe(nfcOrder);
    d.close();
  });

  it('normalizeArabicJoinKeys re-spells alef-madda when that is what matches a lemma', async () => {
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    await seedJoinFixture(d);
    // Stored in the page's mark order as well as the morphology's spelling,
    // which pins the order of the two passes: the fold compares against
    // stored lemmas, so running it before the NFC pass finds nothing to match
    // and the form keeps its alef-madda.
    const storedLemma = `ط${FATHA}${DAGGER_ALEF_MADDA}ق${SHADDA}${FATHA}`;
    await addWord(d, 1, storedLemma, 'Hqq');
    await addForm(d, 10, `ط${FATHA}${ALEF_MADDA}ق${SHADDA}${FATHA}`);

    await normalizeArabicJoinKeys(d);

    const form = await d.execute('SELECT form_arabic FROM root_forms WHERE id = 10');
    expect(form.rows[0]!['form_arabic']).toBe(storedLemma.normalize('NFC'));
    const joined = await d.execute(
      'SELECT COUNT(*) AS n FROM root_forms rf JOIN word_segments ws ON ws.lemma = rf.form_arabic WHERE rf.id = 10',
    );
    expect(joined.rows[0]!['n']).toBe(1);
    d.close();
  });

  it('normalizeArabicJoinKeys never moves a form off a lemma it already matches', async () => {
    // No root in the corpus carries both spellings today, so this guard is
    // defensive -- but a form that already matches is not a mismatch to
    // repair, and re-spelling it would silently change which occurrences its
    // chip returns.
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    await seedJoinFixture(d);
    const asScraped = `ط${FATHA}${ALEF_MADDA}ق`;
    await addWord(d, 1, asScraped, 'Hqq');
    await addWord(d, 2, `ط${FATHA}${DAGGER_ALEF_MADDA}ق`, 'Hqq');
    await addForm(d, 10, asScraped);

    await normalizeArabicJoinKeys(d);

    const form = await d.execute('SELECT form_arabic FROM root_forms WHERE id = 10');
    expect(form.rows[0]!['form_arabic']).toBe(asScraped);
    d.close();
  });

  it('normalizeArabicJoinKeys leaves a form alone when the re-spelling is not a real lemma', async () => {
    // The fold is self-verifying, not a blind character swap: root Amm's
    // آمِّين is a genuine alef-madda, and ٰٓمِّين is not a word. A form that
    // matches nothing is left exactly as scraped rather than rewritten into a
    // spelling the corpus does not contain.
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    await seedJoinFixture(d);
    const genuine = `${ALEF_MADDA}م${SHADDA}ين`.normalize('NFC');
    await addWord(d, 1, `${ALEF_MADDA}م${FATHA}ة`.normalize('NFC'), 'Hqq');
    await addForm(d, 10, genuine);

    await normalizeArabicJoinKeys(d);

    const form = await d.execute('SELECT form_arabic FROM root_forms WHERE id = 10');
    expect(form.rows[0]!['form_arabic']).toBe(genuine);
    expect(form.rows[0]!['form_arabic']).toContain(ALEF_MADDA);
    d.close();
  });

  it('normalizeArabicJoinKeys is idempotent', async () => {
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    await seedJoinFixture(d);
    await addWord(d, 1, `ط${FATHA}${DAGGER_ALEF_MADDA}ئ`, 'Hqq');
    await addForm(d, 10, `ط${FATHA}${ALEF_MADDA}ئ`);

    await normalizeArabicJoinKeys(d);
    const once = await d.execute('SELECT form_arabic FROM root_forms WHERE id = 10');
    await normalizeArabicJoinKeys(d);
    const twice = await d.execute('SELECT form_arabic FROM root_forms WHERE id = 10');

    expect(twice.rows[0]!['form_arabic']).toBe(once.rows[0]!['form_arabic']);
    d.close();
  });
});

describe('splitStatements', () => {
  it('keeps a BEGIN…END trigger body as one statement', () => {
    const sql = `CREATE TABLE t (id INTEGER);
CREATE TRIGGER trg AFTER UPDATE ON t BEGIN
  INSERT INTO t(id) VALUES (NEW.id);
  DELETE FROM t WHERE id = 0;
END;
CREATE INDEX ix ON t(id);`;
    const parts = splitStatements(sql).map((s) => s.trim()).filter(Boolean);
    expect(parts).toHaveLength(3);
    expect(parts[1]).toContain('CREATE TRIGGER');
    expect(parts[1]).toContain('END');
    expect(parts[1]!.match(/INSERT|DELETE/g)).toHaveLength(2);
  });

  it('splits ordinary semicolon statements', () => {
    const parts = splitStatements('SELECT 1; SELECT 2;').map((s) => s.trim()).filter(Boolean);
    expect(parts).toHaveLength(2);
  });
});

describe('search_fts schema', () => {
  it('creates the FTS table and translation triggers', async () => {
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    const master = await d.execute(
      "SELECT name, type FROM sqlite_master WHERE name = 'search_fts' OR name LIKE 'trg_translations_%'",
    );
    const names = new Set(master.rows.map((r) => r['name'] as string));
    expect(names.has('search_fts')).toBe(true);
    expect(names.has('trg_translations_ai')).toBe(true);
    expect(names.has('trg_translations_ad')).toBe(true);
    d.close();
  });

  it('trigger indexes a translation on insert', async () => {
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    await d.execute("INSERT INTO surahs VALUES (1,'a','A','A','meccan',7,1)");
    await d.execute("INSERT INTO ayahs (id,surah_id,ayah_number,text_uthmani) VALUES (1,1,1,'x')");
    await d.execute("INSERT INTO languages VALUES ('en','English','English','ltr')");
    await d.execute(
      "INSERT INTO translations (ayah_id,language_code,translator,text) VALUES (1,'en','T','the throne verse')",
    );
    const hit = await d.execute("SELECT surah_id, source FROM search_fts WHERE search_fts MATCH 'throne'");
    expect(hit.rows).toHaveLength(1);
    expect(hit.rows[0]!['source']).toBe('en');
    d.close();
  });
});

describe('migration comment handling', () => {
  it('does not let a semicolon inside a -- comment split the following statement', () => {
    const sql = `-- a; b\nCREATE TABLE t (id INTEGER);`;
    const parts = splitStatements(stripLineComments(sql))
      .map((s) => s.trim())
      .filter(Boolean);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain('CREATE TABLE t');
    expect(parts[0]).not.toContain('--');
  });

  it('does not drop a statement preceded by a comment line with no separating ;', () => {
    const sql = `-- doc\nCREATE TABLE u (id INTEGER);`;
    const parts = splitStatements(stripLineComments(sql))
      .map((s) => s.trim())
      .filter(Boolean);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain('CREATE TABLE u');
  });
});
