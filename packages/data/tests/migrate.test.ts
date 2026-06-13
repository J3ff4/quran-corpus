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
});
