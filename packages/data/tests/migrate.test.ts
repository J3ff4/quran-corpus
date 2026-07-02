import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
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
