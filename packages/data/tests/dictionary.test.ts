import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import {
  getLemmaFrequency,
  getLemmaFrequencyNeighbors,
  getVerbConcordance,
} from '../src/queries/dictionary.js';

let db: Client;
// Reachable from the test bodies: the past-rank-200 test inserts its own rows.
let ayahId: number;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute(
    `INSERT INTO surahs (id,name_arabic,name_translit,name_translation,revelation_type,ayah_count,order_number) VALUES (1,'ا','a','a','meccan',7,1)`,
  );
  const a = await db.execute(
    `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,1,'x') RETURNING id`,
  );
  ayahId = a.rows[0]!['id'] as number;
  // lemma 'qwl' appears 3x, 'ktb' 1x; two verbs, one noun. The FIRST 'qwl' row
  // spells the lemma 'قولٌ' and the other two spell it 'قول' -- one buckwalter
  // key, two surface spellings. First, because a bare column under GROUP BY
  // resolves to the row the group scan opened on, so a deviant spelling
  // anywhere else is invisible to the test.
  await db.execute({
    sql: `INSERT INTO words (ayah_id,position,text_arabic,lemma,lemma_buckwalter,pos_tag) VALUES
          (?,1,'قَالَ','قولٌ','qwl','V'),
          (?,2,'يَقُولُ','قول','qwl','V'),
          (?,3,'قَوْل','قول','qwl','N'),
          (?,4,'كَتَبَ','كتب','ktb','V'),
          (?,5,'بَرَكَة','بركة','brk','N')`,
    args: [ayahId, ayahId, ayahId, ayahId, ayahId],
  });
});
afterAll(() => db.close());

describe('getLemmaFrequency', () => {
  it('ranks lemmas by count', async () => {
    const rows = await getLemmaFrequency(db);
    expect(rows[0]?.lemma_buckwalter).toBe('qwl');
    expect(rows[0]?.count).toBe(3);
  });

  it('labels a multi-spelling lemma by rule, not by scan order', async () => {
    // The fixture spells 'qwl' both 'قول' and 'قولٌ'. A bare `lemma` column
    // under GROUP BY hands back the row the group scan opened on -- here the
    // 'قولٌ' one -- and the row would then link to a page headed 'قول'.
    const rows = await getLemmaFrequency(db);
    expect(rows.find((r) => r.lemma_buckwalter === 'qwl')?.lemma).toBe('قول');
  });
});

describe('getVerbConcordance', () => {
  it('includes only verbs, grouped by lemma', async () => {
    const rows = await getVerbConcordance(db);
    const lemmas = rows.map((r) => r.lemma);
    expect(lemmas).toContain('قول');
    expect(lemmas).toContain('كتب');
    // 'qwl' as verb appears twice (the noun row is excluded)
    const qwl = rows.find((r) => r.lemma === 'قول');
    expect(qwl?.count).toBe(2);
  });
});

describe('getLemmaFrequencyNeighbors', () => {
  it('walks the same order the lemma list is rendered in', async () => {
    // qwl(3), then brk(1) and ktb(1) tied and broken alphabetically.
    expect(await getLemmaFrequencyNeighbors(db, 'qwl', 'lemmas')).toEqual({
      prev: null,
      next: 'brk',
    });
    expect(await getLemmaFrequencyNeighbors(db, 'ktb', 'lemmas')).toEqual({
      prev: 'brk',
      next: null,
    });
  });

  it('breaks a count tie alphabetically, in both directions', async () => {
    // A symmetric pair, which is what catches a comparison flipped in only
    // one of the two queries.
    expect((await getLemmaFrequencyNeighbors(db, 'brk', 'lemmas')).next).toBe('ktb');
    expect((await getLemmaFrequencyNeighbors(db, 'ktb', 'lemmas')).prev).toBe('brk');
  });

  it('counts only verb occurrences for the verb list', async () => {
    // qwl is 3 as a lemma but 2 as a verb, and brk is not a verb at all, so
    // the verb ranking is qwl(2) then ktb(1) -- brk must not appear in it.
    expect(await getLemmaFrequencyNeighbors(db, 'qwl', 'verbs')).toEqual({
      prev: null,
      next: 'ktb',
    });
    expect((await getLemmaFrequencyNeighbors(db, 'ktb', 'verbs')).prev).toBe('qwl');
  });

  it('has no neighbours for a lemma the corpus does not carry', async () => {
    expect(await getLemmaFrequencyNeighbors(db, 'zzzz', 'lemmas')).toEqual({
      prev: null,
      next: null,
    });
  });

  it('resolves neighbours past rank 200, which the list query truncates at', async () => {
    // getLemmaFrequency defaults to LIMIT 200. A neighbour lookup built on
    // that truncation returns nothing here -- and device check 35 requires
    // scrolling past row 200. Runs last: these 210 rows all have count 1, so
    // they sort after brk/ktb and would otherwise move their neighbours.
    const values = Array.from({ length: 210 }, (_, i) => {
      const bw = `zz${String(i).padStart(3, '0')}`;
      return `(${ayahId},${100 + i},'x','x','${bw}','N')`;
    }).join(',');
    await db.execute(
      `INSERT INTO words (ayah_id,position,text_arabic,lemma,lemma_buckwalter,pos_tag) VALUES ${values}`,
    );

    expect(await getLemmaFrequencyNeighbors(db, 'zz205', 'lemmas')).toEqual({
      prev: 'zz204',
      next: 'zz206',
    });
  });
});
