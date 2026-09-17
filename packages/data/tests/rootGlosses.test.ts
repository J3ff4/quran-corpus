import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getRootGlosses } from '../src/queries/rootGlosses.js';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute(`INSERT INTO languages (code, name_native, name_english, direction)
        VALUES ('uz', 'Ozbekcha', 'Uzbek', 'ltr'), ('en', 'English', 'English', 'ltr')`);
  await db.execute(`INSERT INTO roots (id, root_buckwalter, root_arabic) VALUES (1, 'ktb', 'كتب')`);
  // Deliberately inserted out of rank order: the query orders, not the insert.
  await db.execute(`INSERT INTO root_glosses (root_id, language_code, rank, gloss, occurrence_count)
        VALUES (1, 'uz', 2, 'yozdi', 12), (1, 'uz', 1, 'kitob', 80),
               (1, 'en', 1, 'book', 90)`);
});

afterAll(() => db.close());

describe('getRootGlosses', () => {
  // Mutation note: flipping to `ORDER BY rank DESC` fails this. DELETING the
  // ORDER BY does not, and cannot -- root_glosses' primary key is
  // (root_id, language_code, rank), so the index scan already yields rank
  // order and no data can separate the two. The clause stays because the
  // planner's choice is not a guarantee.
  it('returns one language ranked, most frequent first', async () => {
    expect(await getRootGlosses(db, 1, 'uz')).toEqual([
      { gloss: 'kitob', occurrence_count: 80 },
      { gloss: 'yozdi', occurrence_count: 12 },
    ]);
  });

  it('does not leak another language into the list', async () => {
    const glosses = await getRootGlosses(db, 1, 'uz');
    expect(glosses.map((g) => g.gloss)).not.toContain('book');
  });

  it('returns empty for a root with no glosses in that language', async () => {
    expect(await getRootGlosses(db, 1, 'ru')).toEqual([]);
    expect(await getRootGlosses(db, 999, 'uz')).toEqual([]);
  });
});
