import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '../src/db.js';
import { runMigrations, splitStatements, stripLineComments } from '../src/migrate.js';
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
    for (const c of ['morphology_description', 'grammar_arabic', 'audio_url']) {
      expect(cols.has(c)).toBe(true);
    }
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
