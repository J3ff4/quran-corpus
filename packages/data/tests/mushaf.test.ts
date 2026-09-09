import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getMushafPage } from '../src/queries/mushaf.js';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute(`INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
                    VALUES (2, 'x', 'Al-Baqarah', 'The Cow', 'medinan', 5, 1)`);
  // seq deliberately inserted out of order, and line 2 before line 1: the query
  // must impose order, not inherit whatever the table hands back.
  await db.execute(`INSERT INTO mushaf_layout (page, line, seq, surah_id, ayah_number, position, char_type, glyph) VALUES
    (2, 2, 1, 2, 2, 1, 'word', 'C'),
    (2, 1, 2, 2, 1, 2, 'word', 'B'),
    (2, 1, 1, 2, 1, 1, 'word', 'A'),
    (2, 1, 3, 2, 1, 3, 'end',  'M'),
    (3, 1, 1, 2, 3, 1, 'word', 'Z')`);
});

afterAll(() => db.close());

describe('getMushafPage', () => {
  it('returns lines in order, words in seq order', async () => {
    const lines = await getMushafPage(db, 2);
    expect(lines.map((l) => l.line)).toEqual([1, 2]);
    expect(lines[0].words.map((w) => w.glyph)).toEqual(['A', 'B', 'M']);
    expect(lines[0].words[2].charType).toBe('end');
    expect(lines[1].words[0]).toMatchObject({ surahId: 2, ayahNumber: 2, position: 1 });
  });

  it('does not leak a neighbouring page', async () => {
    const lines = await getMushafPage(db, 2);
    expect(lines.flatMap((l) => l.words).map((w) => w.glyph)).not.toContain('Z');
  });

  it('returns an empty array for a page with no rows', async () => {
    expect(await getMushafPage(db, 600)).toEqual([]);
  });

  // The page number arrives from a route param -- a trust boundary (§3 OWASP).
  it.each([0, 605, 1.5, NaN, Number.MAX_SAFE_INTEGER])('rejects page %s', async (page) => {
    await expect(getMushafPage(db, page as number)).rejects.toThrow(RangeError);
  });
});
