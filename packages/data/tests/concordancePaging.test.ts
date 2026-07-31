import { describe, it, expect, beforeEach } from 'vitest';
import type { Client } from '@libsql/client';
import {
  parseConcordancePaging,
  assertPagingBounds,
  createDatabase,
  runMigrations,
  CONCORDANCE_PAGE_SIZE,
  CONCORDANCE_MAX_LIMIT,
} from '../src/index.js';
// Not on the barrel -- internal helper shared by the root and lemma
// concordance queries, imported from the module under test.
import { buildVerseWordsByAyah } from '../src/queries/concordance.js';

const parse = (qs: string) => parseConcordancePaging(new URLSearchParams(qs));

describe('parseConcordancePaging', () => {
  it('defaults when the params are absent', () => {
    expect(parse('')).toEqual({ limit: CONCORDANCE_PAGE_SIZE, offset: 0 });
  });

  it('passes through valid values', () => {
    expect(parse('limit=5&offset=40')).toEqual({ limit: 5, offset: 40 });
  });

  it('clamps limit to the ceiling and floor', () => {
    expect(parse('limit=999').limit).toBe(CONCORDANCE_MAX_LIMIT);
    expect(parse('limit=-3').limit).toBe(1);
    expect(parse('offset=-3').offset).toBe(0);
  });

  // Number('') and Number('  ') are 0, not NaN, so a blank value passes
  // Number.isInteger and clamps to the FLOOR. `?limit=` served a 1-row page
  // instead of the default 20 -- Load-more then paged the concordance one
  // occurrence at a time.
  it('treats a blank value as absent, not as zero', () => {
    expect(parse('limit=').limit).toBe(CONCORDANCE_PAGE_SIZE);
    expect(parse('limit=%20%20').limit).toBe(CONCORDANCE_PAGE_SIZE);
    expect(parse('offset=').offset).toBe(0);
  });

  it('falls back on non-numeric and fractional junk', () => {
    expect(parse('limit=abc').limit).toBe(CONCORDANCE_PAGE_SIZE);
    expect(parse('limit=1.5').limit).toBe(CONCORDANCE_PAGE_SIZE);
    expect(parse('offset=NaN').offset).toBe(0);
  });
});

describe('assertPagingBounds', () => {
  // The routes clamp their own input, so this guard only ever fires on a
  // programming error -- which is exactly why it needs its own test: no route
  // test can reach it. A negative limit is the one that matters, since SQLite
  // reads `LIMIT -1` as "no limit" and would rebuild every verse of the
  // concordance instead of one page.
  it('rejects a limit SQLite would read as unbounded, and junk offsets', () => {
    expect(() => assertPagingBounds(-1, 0)).toThrow(RangeError);
    expect(() => assertPagingBounds(0, 0)).toThrow(RangeError);
    expect(() => assertPagingBounds(1.5, 0)).toThrow(RangeError);
    expect(() => assertPagingBounds(undefined, -1)).toThrow(RangeError);
    expect(() => assertPagingBounds(undefined, 1.5)).toThrow(RangeError);
  });

  it('allows an omitted limit (whole concordance) and valid paging', () => {
    expect(() => assertPagingBounds(undefined, 0)).not.toThrow();
    expect(() => assertPagingBounds(20, 40)).not.toThrow();
  });
});

describe('buildVerseWordsByAyah', () => {
  let db: Client;

  beforeEach(async () => {
    db = createDatabase('file::memory:');
    await runMigrations(db);
    await db.execute(
      "INSERT INTO surahs (id,name_arabic,name_translit,name_translation,revelation_type,ayah_count,order_number) VALUES (1,'x','x','x','meccan',2,1)",
    );
    await db.execute(
      "INSERT INTO ayahs (id,surah_id,ayah_number,text_uthmani) VALUES (10,1,1,'a'),(11,1,2,'b')",
    );
    await db.execute(
      "INSERT INTO words (id,ayah_id,position,text_arabic) VALUES (100,10,1,'قال'),(101,10,2,'ثم'),(102,11,1,'من')",
    );
    // First segment of word 101 is a clause boundary; word 100 has a segment
    // that is not, so the flag is exercised in both directions.
    await db.execute(
      "INSERT INTO word_segments (word_id,segment_index,pos_tag) VALUES (100,1,'V'),(101,1,'REM')",
    );
  });

  it('rejects a batchSize outside 1..500', async () => {
    // batchSize < 1 would never advance the loop counter -- an infinite loop of
    // empty queries, not a wrong answer -- and > 500 drops this helper's
    // SQLITE_LIMIT_VARIABLE_NUMBER guarantee. Neither is reachable from a
    // route, so this is the only place either is checked.
    for (const bad of [0, -1, 1.5, 501, NaN]) {
      await expect(buildVerseWordsByAyah(db, [10], bad)).rejects.toThrow(RangeError);
    }
  });

  it('batches without dropping, duplicating, or reordering words', async () => {
    // batchSize 1 forces one query per ayah, so a batching bug shows up as a
    // difference from the single-batch result rather than as a silent subset.
    const batched = await buildVerseWordsByAyah(db, [10, 11], 1);
    const single = await buildVerseWordsByAyah(db, [10, 11]);
    expect(batched).toEqual(single);
    expect([...batched.keys()].sort((a, b) => a - b)).toEqual([10, 11]);
    expect(batched.get(10)!.map((w) => w.id)).toEqual([100, 101]);
    expect(batched.get(11)!.map((w) => w.id)).toEqual([102]);
  });

  it('returns an empty map for no ayah ids', async () => {
    expect(await buildVerseWordsByAyah(db, [])).toEqual(new Map());
  });

  it('flags a clause-starting word from its first segment', async () => {
    const m = await buildVerseWordsByAyah(db, [10]);
    expect(m.get(10)!.map((w) => w.starts_clause)).toEqual([false, true]);
  });
});
