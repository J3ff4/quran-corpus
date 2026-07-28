import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import {
  getRootByBuckwalter,
  getAllRoots,
  getRootArabicList,
  getRootsByFrequency,
  searchRoots,
  getRootEntry,
  getRootConcordance,
  getRootConcordancePage,
  countRootConcordance,
  getRootSearchList,
  getRootForms,
  getRootNeighbors,
  backfillRootSortOrder,
  backfillRootSortOrderIfStale,
} from '../src/queries/roots.js';

let db: Client;

/** A throwaway file-backed database.
 *
 *  Anything that calls backfillRootSortOrder needs one: it works inside a
 *  transaction, and libsql opens `file::memory:` per connection, so the
 *  transaction would see an empty database rather than this one. Production is
 *  always file-backed, so this costs the tests a tmp dir and nothing else. */
const tmpDbDir = mkdtempSync(join(tmpdir(), 'quran-roots-'));
let tmpDbCount = 0;
function newFileDb(): Client {
  return createDatabase(`file:${join(tmpDbDir, `t${tmpDbCount++}.db`)}`);
}
afterAll(() => rmSync(tmpDbDir, { recursive: true, force: true }));

/** Insert a stem segment carrying `root` for an existing word, so the
 *  concordance queries (which now match word_segments.root) see it. */
async function seedSegment(wordId: number, root: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root)
          VALUES (?,0,'stem',?)`,
    args: [wordId, root],
  });
}

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute(
    `INSERT INTO languages (code,name_native,name_english,direction) VALUES ('en','English','English','ltr')`,
  );
  await db.execute(
    `INSERT INTO surahs (id,name_arabic,name_translit,name_translation,revelation_type,ayah_count,order_number) VALUES (1,'ا','a','a','meccan',7,1)`,
  );
  const a = await db.execute(
    `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,1,'بِسْمِ ٱللَّهِ') RETURNING id`,
  );
  const ayahId = a.rows[0]!['id'] as number;
  await db.execute({
    sql: `INSERT INTO words (ayah_id,position,text_arabic,transliteration,root,root_buckwalter,pos_tag) VALUES (?,1,'بِسْمِ','bismi','س م و','smw','P'),(?,2,'ٱللَّهِ','l-lahi',NULL,NULL,'PN')`,
    args: [ayahId, ayahId],
  });
  const w = await db.execute(`SELECT id FROM words WHERE position=1`);
  const wid = w.rows[0]!['id'] as number;
  await db.execute({
    sql: `INSERT INTO word_glosses (word_id,language_code,gloss_text) VALUES (?, 'en','In (the) name')`,
    args: [wid],
  });
  await seedSegment(wid, 'smw');
  const r = await db.execute(
    `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('smw','س م و',5),('ktb','ك ت ب',319),('$Am','ش أ م',3) RETURNING id`,
  );
  const smwId = r.rows[0]!['id'] as number;
  await db.execute({
    sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,form_translit,occurrence_count) VALUES (?,0,'Noun','ٱسْم','ism',5)`,
    args: [smwId],
  });
  await db.execute({
    sql: `INSERT INTO root_definitions (root_id,source,definition) VALUES (?,'lane','To be high')`,
    args: [smwId],
  });
});
afterAll(() => db.close());

describe('roots queries', () => {
  it('getRootByBuckwalter', async () => {
    expect((await getRootByBuckwalter(db, 'smw'))?.root_arabic).toBe('س م و');
  });
  it('getRootByBuckwalter unknown -> null', async () => {
    expect(await getRootByBuckwalter(db, 'zzz')).toBeNull();
  });
  it('getAllRoots is in Arabic hijāʾī order, not Buckwalter', async () => {
    // hijāʾī index: س=12 (smw) < ش=13 ($Am) < ك=22 (ktb)
    expect((await getAllRoots(db)).map((r) => r.root_buckwalter)).toEqual([
      'smw', '$Am', 'ktb',
    ]);
  });
  it('getRootNeighbors returns hijāʾī-adjacent roots; null at ends (fallback, no sort_order)', async () => {
    // Shared db is seeded without sort_order, so this exercises the full-sort
    // fallback path. order: smw < $Am < ktb
    expect(await getRootNeighbors(db, '$Am')).toEqual({ prev: 'smw', next: 'ktb' });
    expect(await getRootNeighbors(db, 'smw')).toEqual({ prev: null, next: '$Am' });
    expect(await getRootNeighbors(db, 'ktb')).toEqual({ prev: '$Am', next: null });
    expect(await getRootNeighbors(db, 'zzz')).toEqual({ prev: null, next: null });
  });
  it('backfillRootSortOrder materializes hijāʾī rank; getRootNeighbors then uses it', async () => {
    const d = newFileDb();
    await runMigrations(d);
    await d.execute(
      `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count)
       VALUES ('ktb','ك ت ب',319),('smw','س م و',5),('$Am','ش أ م',3)`,
    );
    const n = await backfillRootSortOrder(d);
    expect(n).toBe(3);
    // ranks 1..N in hijāʾī order regardless of insert order: smw < $Am < ktb
    const ranked = await d.execute('SELECT root_buckwalter FROM roots ORDER BY sort_order');
    expect(ranked.rows.map((r) => r['root_buckwalter'])).toEqual(['smw', '$Am', 'ktb']);
    // indexed path returns the same neighbors as the fallback would
    expect(await getRootNeighbors(d, '$Am')).toEqual({ prev: 'smw', next: 'ktb' });
    expect(await getRootNeighbors(d, 'smw')).toEqual({ prev: null, next: '$Am' });
    expect(await getRootNeighbors(d, 'ktb')).toEqual({ prev: '$Am', next: null });
    d.close();
  });
  describe('sort_order cache invalidation', () => {
    /** Three roots with the rank cache already materialized. */
    async function seedRanked(): Promise<Client> {
      const d = newFileDb();
      await runMigrations(d);
      await d.execute(
        `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count)
         VALUES ('ktb','ك ت ب',319),('smw','س م و',5),('$Am','ش أ م',3)`,
      );
      await backfillRootSortOrder(d);
      return d;
    }
    const ranks = async (d: Client): Promise<(number | null)[]> =>
      (await d.execute('SELECT sort_order FROM roots ORDER BY id')).rows.map(
        (r) => r['sort_order'] as number | null,
      );

    it('inserting a root nulls every rank, not just the new row', async () => {
      const d = await seedRanked();
      // Nulling only the new row would be worse than nothing: getRootNeighbors
      // walks `sort_order < ?` / `> ?`, which skip NULLs, so the other three
      // roots' arrows would jump clean over the newcomer with no error.
      await d.execute(
        `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('Erb','ع ر ب',9)`,
      );
      expect(await ranks(d)).toEqual([null, null, null, null]);
      d.close();
    });

    it('an insert that supplies its own rank has it nulled too', async () => {
      const d = await seedRanked();
      // Only backfillRootSortOrder may compute a rank, and it uses UPDATE — so
      // a rank arriving in an INSERT came from somewhere unauthorized and
      // cannot be assumed to agree with the rest of the column.
      await d.execute(
        `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count,sort_order)
         VALUES ('Erb','ع ر ب',9,99)`,
      );
      expect(await ranks(d)).toEqual([null, null, null, null]);
      d.close();
    });

    it('respelling root_arabic nulls the ranks it reordered', async () => {
      const d = await seedRanked();
      // The 930-root hamza seat level-up: ش ا م -> ش أ م changes where the root
      // sorts, so ranks materialized before it are now simply wrong.
      await d.execute(`UPDATE roots SET root_arabic = 'ش ا م' WHERE root_buckwalter = '$Am'`);
      expect(await ranks(d)).toEqual([null, null, null]);
      d.close();
    });

    it('an upsert that rewrites root_arabic to the same value keeps the cache', async () => {
      const d = await seedRanked();
      // upsert_root's ON CONFLICT DO UPDATE always lists root_arabic in its SET
      // clause, so without the WHEN guard an idempotent re-scrape would throw
      // the whole cache away on every one of 1642 rows.
      await d.execute(
        `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('ktb','ك ت ب',400)
         ON CONFLICT(root_buckwalter) DO UPDATE SET
           root_arabic = excluded.root_arabic, occurrence_count = excluded.occurrence_count`,
      );
      expect(await ranks(d)).toEqual([3, 1, 2]);
      d.close();
    });

    it('backfillRootSortOrder does not invalidate its own writes', async () => {
      // It writes `UPDATE roots SET sort_order = ?` — an UPDATE OF sort_order.
      // Were the trigger a bare AFTER UPDATE ON roots it would null each rank
      // as fast as the batch wrote it, leaving the column entirely NULL.
      const d = await seedRanked();
      expect(await ranks(d)).toEqual([3, 1, 2]);
      d.close();
    });

    it('deleting a root leaves a harmless rank gap, not a wipe', async () => {
      const d = await seedRanked();
      await d.execute(`DELETE FROM roots WHERE root_buckwalter = '$Am'`);
      expect(await ranks(d)).toEqual([3, 1]);
      // ranks 1 and 3 with 2 missing: the survivors still find each other.
      expect(await getRootNeighbors(d, 'smw')).toEqual({ prev: null, next: 'ktb' });
      expect(await getRootNeighbors(d, 'ktb')).toEqual({ prev: 'smw', next: null });
      d.close();
    });

    it('backfillRootSortOrderIfStale rebuilds after invalidation and no-ops after that', async () => {
      const d = await seedRanked();
      expect(await backfillRootSortOrderIfStale(d)).toBe(0);
      await d.execute(
        `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('Erb','ع ر ب',9)`,
      );
      expect(await backfillRootSortOrderIfStale(d)).toBe(4);
      // ع sorts after ش but before ك: smw < $Am < Erb < ktb
      const ordered = await d.execute('SELECT root_buckwalter FROM roots ORDER BY sort_order');
      expect(ordered.rows.map((r) => r['root_buckwalter'])).toEqual([
        'smw',
        '$Am',
        'Erb',
        'ktb',
      ]);
      expect(await backfillRootSortOrderIfStale(d)).toBe(0);
      d.close();
    });

    it('a root inserted mid-backfill never leaves one NULL rank among live ones', async () => {
      // The read and the write must be one transaction. Split apart, an insert
      // landing between them fires its trigger against an already-NULL column
      // (a no-op) and is then missed by the write, which only knows the stale
      // snapshot -- one NULL stranded among live ranks, which the neighbour
      // queries step straight over. Needs a real file: two clients, one lock.
      const file = join(tmpDbDir, `race${tmpDbCount++}.db`);
      const a = createDatabase(`file:${file}`);
      await runMigrations(a);
      await a.execute(
        `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count)
         VALUES ('ktb','ك ت ب',319),('smw','س م و',5),('$Am','ش أ م',3)`,
      );
      const b = createDatabase(`file:${file}`);

      await Promise.allSettled([
        backfillRootSortOrder(a),
        b.execute(
          `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('Erb','ع ر ب',9)`,
        ),
      ]);

      const counts = await a.execute(
        'SELECT COUNT(*) AS n, COUNT(sort_order) AS ranked FROM roots',
      );
      const n = counts.rows[0]!['n'] as number;
      const ranked = counts.rows[0]!['ranked'] as number;
      // All ranked or all NULL -- the mixed state is the bug.
      expect([0, n]).toContain(ranked);
      a.close();
      b.close();
    });

    it('backfillRootSortOrderIfStale no-ops on an empty roots table', async () => {
      // File-backed like the rest: this passes today only because the stale
      // probe short-circuits before a transaction opens. Fold the probe in and
      // an in-memory DB would start passing for the wrong reason.
      const d = newFileDb();
      await runMigrations(d);
      expect(await backfillRootSortOrderIfStale(d)).toBe(0);
      d.close();
    });
  });
  it('getRootsByFrequency', async () => {
    expect((await getRootsByFrequency(db))[0]?.root_buckwalter).toBe('ktb');
  });
  it('searchRoots by buckwalter', async () => {
    expect((await searchRoots(db, 'smw')).length).toBe(1);
  });
  it('getRootEntry bundles forms + definitions', async () => {
    const e = await getRootEntry(db, 'smw');
    expect(e?.forms.length).toBe(1);
    expect(e?.definitions[0]?.definition).toBe('To be high');
  });
  it('getRootForms excludes null-arabic (junk) rows', async () => {
    const smwId = (await getRootByBuckwalter(db, 'smw'))!.id;
    // a See-Also-style junk row: pos_label set, form_arabic NULL
    await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,occurrence_count) VALUES (?,50,'Lane''s Lexicon',NULL,0)`,
      args: [smwId],
    });
    const forms = await getRootForms(db, smwId);
    expect(forms.every((f) => f.form_arabic !== null)).toBe(true);
    expect(forms.some((f) => f.pos_label === "Lane's Lexicon")).toBe(false);
  });
  it('getRootForms strips the Quranic small-high mark from form_arabic', async () => {
    const smwId = (await getRootByBuckwalter(db, 'smw'))!.id;
    await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,occurrence_count) VALUES (?,60,'verb','يَسْجُدُوا۟',1)`,
      args: [smwId],
    });
    const forms = await getRootForms(db, smwId);
    expect(forms.find((f) => f.pos_label === 'verb')?.form_arabic).toBe('يَسْجُدُوا');
  });
  it('getRootConcordance rebuilds verse from words + keeps gloss', async () => {
    const c = await getRootConcordance(db, 'smw');
    expect(c).toHaveLength(1);
    expect(c[0]?.gloss).toBe('In (the) name');
    expect(c[0]?.verse_words.map((w) => w.text_arabic)).toEqual(['بِسْمِ', 'ٱللَّهِ']);
    const ids = c[0]!.verse_words.map((w) => w.id);
    expect(ids).toContain(c[0]!.word_id); // matched word is among the verse words
  });
  it('getRootConcordance unknown root -> []', async () => {
    expect(await getRootConcordance(db, 'zzz')).toEqual([]);
  });
  it('getRootArabicList returns every root_arabic', async () => {
    expect((await getRootArabicList(db)).sort()).toEqual(['س م و', 'ش أ م', 'ك ت ب']);
  });
  it('getRootSearchList returns every root, ktb (no forms) with a null blob', async () => {
    const list = await getRootSearchList(db);
    expect(list.length).toBe(3);
    expect(list.find((r) => r.root_buckwalter === 'ktb')?.gloss_blob).toBeNull();
  });
  it('getRootSearchList concatenates a root’s form glosses', async () => {
    const smwId = (await getRootByBuckwalter(db, 'smw'))!.id;
    await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,gloss,occurrence_count) VALUES (?,1,'Noun','name',1),(?,2,'Noun','high place',1)`,
      args: [smwId, smwId],
    });
    const smw = (await getRootSearchList(db)).find((r) => r.root_buckwalter === 'smw');
    expect(smw?.gloss_blob).toBe('name high place');
  });
  it('getRootConcordance batches ayah IDs (batchSize=1) without dropping words', async () => {
    // a2 in a second ayah; same root 'bat' matched in two ayahs -> two batches
    const a2 = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,2,'x') RETURNING id`,
    );
    const a2id = a2.rows[0]!['id'] as number;
    const a1 = await db.execute(`SELECT id FROM ayahs WHERE surah_id=1 AND ayah_number=1`);
    const a1id = a1.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,9,'بَتْ','bat','N'),(?,1,'بَتّ','bat','N')`,
      args: [a1id, a2id],
    });
    const bws = await db.execute(`SELECT id FROM words WHERE root_buckwalter='bat'`);
    for (const row of bws.rows) await seedSegment(row['id'] as number, 'bat');
    const c = await getRootConcordance(db, 'bat', 'en', 1);
    expect(c).toHaveLength(2);
    // each entry's verse_words come from its own ayah (batch boundary intact)
    expect(c.every((e) => e.verse_words.some((w) => w.id === e.word_id))).toBe(true);
  });
  it('getRootConcordancePage windows with limit/offset; count is total', async () => {
    await db.execute(
      `INSERT INTO surahs (id,name_arabic,name_translit,name_translation,revelation_type,ayah_count,order_number) VALUES (2,'ب','b','b','meccan',5,2)`,
    );
    // 5 matched words for root 'pag', one per ayah of surah 2 (deterministic order)
    for (let n = 1; n <= 5; n++) {
      const a = await db.execute({
        sql: `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (2,?,'ص') RETURNING id`,
        args: [n],
      });
      const aid = a.rows[0]!['id'] as number;
      const wr = await db.execute({
        sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag) VALUES (?,1,'ص','pag','N') RETURNING id`,
        args: [aid],
      });
      await seedSegment(wr.rows[0]!['id'] as number, 'pag');
    }
    expect(await countRootConcordance(db, 'pag')).toBe(5);
    expect(await countRootConcordance(db, 'zzz')).toBe(0);
    expect((await getRootConcordancePage(db, 'pag', { limit: 2, offset: 0 })).length).toBe(2);
    const last = await getRootConcordancePage(db, 'pag', { limit: 2, offset: 4 });
    expect(last.length).toBe(1);
    // paged entries still rebuild their verse via the shared helper
    expect(last[0]!.verse_words.some((w) => w.id === last[0]!.word_id)).toBe(true);
    // offset past the end -> empty
    expect((await getRootConcordancePage(db, 'pag', { limit: 2, offset: 5 })).length).toBe(0);
  });
  it('concordance entries carry form_id via exact lemma-to-root_forms text match', async () => {
    const r = await db.execute(
      `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('gfr2','غفر2',3) RETURNING id`,
    );
    const rid = r.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,form_translit,occurrence_count)
            VALUES (?,0,'Form I verb','غَفَرَ','ghafara',2),(?,1,'Nominal','غَفُور','ghafūr',1)`,
      args: [rid, rid],
    });
    const a = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,10,'x') RETURNING id`,
    );
    const aid = a.rows[0]!['id'] as number;
    // Two occurrences of the SAME lemma text but different pos_tag (ADJ vs
    // N) both map to the ONE 'Nominal' root_forms row -- this is exactly the
    // غَفُور/91-count pattern the design spike found in the live DB.
    await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,1,'a','gfr2','V'),(?,2,'b','gfr2','ADJ'),(?,3,'c','gfr2','N')`,
      args: [aid, aid, aid],
    });
    const rows = await db.execute(`SELECT id FROM words WHERE root_buckwalter='gfr2' ORDER BY position`);
    const [w1, w2, w3] = rows.rows.map((row) => row['id'] as number);
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','gfr2','غَفَرَ')`,
      args: [w1],
    });
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','gfr2','غَفُور')`,
      args: [w2],
    });
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','gfr2','غَفُور')`,
      args: [w3],
    });

    const c = await getRootConcordancePage(db, 'gfr2');
    const byWord = new Map(c.map((e) => [e.word_id, e.form_id]));
    const verbFormId = (await getRootForms(db, rid)).find((f) => f.pos_label === 'Form I verb')!.id;
    const nominalFormId = (await getRootForms(db, rid)).find((f) => f.pos_label === 'Nominal')!.id;
    expect(byWord.get(w1)).toBe(verbFormId);
    expect(byWord.get(w2)).toBe(nominalFormId);
    expect(byWord.get(w3)).toBe(nominalFormId);
  });

  it('concordance entry has null form_id when the lemma matches no root_forms row', async () => {
    await db.execute(
      `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('unk1','x',1)`,
    );
    const a = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,11,'x') RETURNING id`,
    );
    const aid = a.rows[0]!['id'] as number;
    const w = await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag) VALUES (?,1,'x','unk1','N') RETURNING id`,
      args: [aid],
    });
    const wid = w.rows[0]!['id'] as number;
    // A lemma that doesn't match any root_forms.form_arabic for this root (no
    // root_forms row inserted at all for 'unk1').
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','unk1','نَادِر')`,
      args: [wid],
    });
    const c = await getRootConcordancePage(db, 'unk1');
    expect(c).toHaveLength(1);
    expect(c[0]!.form_id).toBeNull();
  });

  it('countRootConcordance and getRootConcordancePage both accept formIds to filter', async () => {
    const r = await db.execute(
      `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('flt1','y',2) RETURNING id`,
    );
    const rid = r.rows[0]!['id'] as number;
    const forms = await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,occurrence_count)
            VALUES (?,0,'Form I verb','فَعَلَ',1),(?,1,'Noun','فِعْل',1) RETURNING id`,
      args: [rid, rid],
    });
    const [verbFormId, nounFormId] = forms.rows.map((row) => row['id'] as number);
    const a = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,12,'x') RETURNING id`,
    );
    const aid = a.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,1,'a','flt1','V'),(?,2,'b','flt1','N')`,
      args: [aid, aid],
    });
    const rows = await db.execute(`SELECT id FROM words WHERE root_buckwalter='flt1' ORDER BY position`);
    const [w1, w2] = rows.rows.map((row) => row['id'] as number);
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','flt1','فَعَلَ')`,
      args: [w1],
    });
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','flt1','فِعْل')`,
      args: [w2],
    });

    expect(await countRootConcordance(db, 'flt1')).toBe(2);
    expect(await countRootConcordance(db, 'flt1', [verbFormId])).toBe(1);
    const filtered = await getRootConcordancePage(db, 'flt1', { formIds: [verbFormId] });
    expect(filtered.map((e) => e.word_id)).toEqual([w1]);
    const both = await getRootConcordancePage(db, 'flt1', { formIds: [verbFormId, nounFormId] });
    expect(both.map((e) => e.word_id).sort()).toEqual([w1, w2].sort());
  });

  it('a duplicated form_arabic within one root does not fan out into duplicate concordance rows', async () => {
    // The live DB has 9 roots (e.g. مَٰلِك under mlk) with two root_forms rows
    // sharing the same form_arabic -- a JOIN on form_arabic = lemma would
    // match a word against both rows and emit it twice.
    const r = await db.execute(
      `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('dup1','z',1) RETURNING id`,
    );
    const rid = r.rows[0]!['id'] as number;
    const forms = await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,occurrence_count)
            VALUES (?,0,'Noun','مَٰلِك',1),(?,1,'Adjective','مَٰلِك',1) RETURNING id`,
      args: [rid, rid],
    });
    const [formA, formB] = forms.rows.map((row) => row['id'] as number);
    const a = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,13,'x') RETURNING id`,
    );
    const aid = a.rows[0]!['id'] as number;
    const w = await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,1,'a','dup1','N') RETURNING id`,
      args: [aid],
    });
    const wid = w.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','dup1','مَٰلِك')`,
      args: [wid],
    });

    const unfiltered = await getRootConcordancePage(db, 'dup1');
    expect(unfiltered).toHaveLength(1);
    expect(unfiltered[0]!.form_id).toBe(Math.min(formA, formB));
    expect(await countRootConcordance(db, 'dup1')).toBe(1);

    // Selecting BOTH duplicate ids at once is the sharpest fan-out case: a
    // JOIN-based filter would match the word against both rows.
    expect(await countRootConcordance(db, 'dup1', [formA, formB])).toBe(1);
    const filtered = await getRootConcordancePage(db, 'dup1', { formIds: [formA, formB] });
    expect(filtered).toHaveLength(1);
  });

  it('two matches in one ayah -> two entries, same verse_words, distinct word_id', async () => {
    const a = await db.execute(`SELECT id FROM ayahs WHERE surah_id=1 AND ayah_number=1`);
    const aid = a.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,3,'كَتَبَ','ktb','V'),(?,4,'كِتَٰب','ktb','N')`,
      args: [aid, aid],
    });
    const kws = await db.execute(`SELECT id FROM words WHERE root_buckwalter='ktb'`);
    for (const row of kws.rows) await seedSegment(row['id'] as number, 'ktb');
    const c = await getRootConcordance(db, 'ktb');
    expect(c).toHaveLength(2);
    expect(c[0]!.word_id).not.toBe(c[1]!.word_id);
    expect(c[0]!.verse_words).toEqual(c[1]!.verse_words);
  });

  it('concordance matches a compound word via its secondary segment root', async () => {
    // A word whose PRIMARY root is 'bny' but whose second segment carries 'Amm'
    // (the يَبْنَؤُمَّ / 20:94:2 shape). The old words.root_buckwalter match missed it.
    const a = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,3,'يَبْنَؤُمَّ') RETURNING id`,
    );
    const aid = a.rows[0]!['id'] as number;
    const w = await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,1,'يَبْنَؤُمَّ','bny','N') RETURNING id`,
      args: [aid],
    });
    const cid = w.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root) VALUES (?,0,'stem','bny'),(?,1,'stem','Amm')`,
      args: [cid, cid],
    });
    // Also a plain word carrying Amm as its primary/only segment.
    const w2 = await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,2,'أُمّ','Amm','N') RETURNING id`,
      args: [aid],
    });
    await seedSegment(w2.rows[0]!['id'] as number, 'Amm');

    expect(await countRootConcordance(db, 'Amm')).toBe(2);
    const list = await getRootConcordancePage(db, 'Amm');
    expect(list.map((e) => e.word_id)).toContain(cid); // compound included
  });

  it('concordance verse_words carry starts_clause from segment pos_tag', async () => {
    const a = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,4,'x y') RETURNING id`,
    );
    const aid = a.rows[0]!['id'] as number;
    const w1 = await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter) VALUES (?,1,'x','clx') RETURNING id`,
      args: [aid],
    });
    const w2 = await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter) VALUES (?,2,'y','cly') RETURNING id`,
      args: [aid],
    });
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,pos_tag,root) VALUES (?,0,'stem','N','clx')`,
      args: [w1.rows[0]!['id']],
    });
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,pos_tag,root) VALUES (?,0,'prefix','REM',NULL),(?,1,'stem','N','cly')`,
      args: [w2.rows[0]!['id'], w2.rows[0]!['id']],
    });
    const c = await getRootConcordancePage(db, 'clx');
    const vw = c[0]!.verse_words;
    expect(vw.find((w) => w.text_arabic === 'x')!.starts_clause).toBe(false);
    expect(vw.find((w) => w.text_arabic === 'y')!.starts_clause).toBe(true);
  });

  it('a plain coordinating CONJ prefix does not count as a clause boundary', async () => {
    // Regression: CONJ (wa-/fa-) fires on almost every item in an enumerated
    // list ("X and Y and Z"), which isn't a real clause break -- only SUB/REM
    // (subordinating/resumptive, genuine sentence-starters) should count.
    const a = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,5,'x y') RETURNING id`,
    );
    const aid = a.rows[0]!['id'] as number;
    const w1 = await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter) VALUES (?,1,'x','clx2') RETURNING id`,
      args: [aid],
    });
    const w2 = await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter) VALUES (?,2,'y','cly2') RETURNING id`,
      args: [aid],
    });
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,pos_tag,root) VALUES (?,0,'stem','N','clx2')`,
      args: [w1.rows[0]!['id']],
    });
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,pos_tag,root) VALUES (?,0,'prefix','CONJ',NULL),(?,1,'stem','N','cly2')`,
      args: [w2.rows[0]!['id'], w2.rows[0]!['id']],
    });
    const c = await getRootConcordancePage(db, 'clx2');
    const vw = c[0]!.verse_words;
    expect(vw.find((w) => w.text_arabic === 'y')!.starts_clause).toBe(false);
  });
});

// searchRoots must be blind to the two ways a user's Arabic differs from the
// stored spelling: inter-letter spaces, and hamza seat. The DB stores compact
// corpus orthography ("أرض"); most keyboards produce bare alef first ("ارض").
describe('searchRoots normalizes Arabic', () => {
  let sdb: Client;
  beforeAll(async () => {
    sdb = createDatabase('file::memory:');
    await runMigrations(sdb);
    await sdb.execute(
      `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count)
       VALUES ('ArD','\u0623\u0631\u0636',461),('ktb','\u0643\u062a\u0628',319)`,
    );
  });
  afterAll(() => sdb.close());

  it('bare-alef query matches a hamza-seat root', async () => {
    const hits = await searchRoots(sdb, '\u0627\u0631\u0636'); // ارض
    expect(hits.map((r) => r.root_buckwalter)).toEqual(['ArD']);
  });
  it('spaced query matches a compact root', async () => {
    const hits = await searchRoots(sdb, '\u0643 \u062a \u0628'); // ك ت ب
    expect(hits.map((r) => r.root_buckwalter)).toEqual(['ktb']);
  });
  it('exact stored spelling still matches', async () => {
    const hits = await searchRoots(sdb, '\u0623\u0631\u0636'); // أرض
    expect(hits.map((r) => r.root_buckwalter)).toEqual(['ArD']);
  });
  it('a non-matching root is not returned', async () => {
    expect(await searchRoots(sdb, '\u0632\u0632\u0632')).toEqual([]); // ززز
  });
});
