import type { Client, Row } from '@libsql/client';
import type {
  Root,
  RootForm,
  RootDefinition,
  RootEntry,
  ConcordanceEntry,
  RootSearchItem,
} from '../types.js';
import { compareRootsArabic, foldRootArabic, foldRootArabicSql } from '../text/arabic.js';
import { stripQuranicAnnotations } from '../text/normalize.js';
import { assertPagingBounds, buildVerseWordsByAyah } from './concordance.js';

function rowToRoot(r: Row): Root {
  return {
    id: r['id'] as number,
    root_buckwalter: r['root_buckwalter'] as string,
    root_arabic: r['root_arabic'] as string,
    occurrence_count: r['occurrence_count'] as number,
  };
}

function rowToForm(r: Row): RootForm {
  return {
    id: r['id'] as number,
    root_id: r['root_id'] as number,
    sort_order: r['sort_order'] as number,
    pos_label: r['pos_label'] as string,
    form_arabic:
      r['form_arabic'] == null ? null : stripQuranicAnnotations(r['form_arabic'] as string),
    form_translit: (r['form_translit'] as string | null) ?? null,
    gloss: (r['gloss'] as string | null) ?? null,
    occurrence_count: r['occurrence_count'] as number,
  };
}

function rowToDefinition(r: Row): RootDefinition {
  return {
    id: r['id'] as number,
    root_id: r['root_id'] as number,
    source: r['source'] as string,
    definition: r['definition'] as string,
  };
}

export async function getRootByBuckwalter(db: Client, bw: string): Promise<Root | null> {
  const res = await db.execute({
    sql: 'SELECT * FROM roots WHERE root_buckwalter = ?',
    args: [bw],
  });
  return res.rows[0] ? rowToRoot(res.rows[0]) : null;
}

/** The one hijāʾī ordering. Shared so backfillRootSortOrder, which must read
 *  inside its own transaction, cannot drift from what getAllRoots returns. */
function orderRoots(rows: Row[]): Root[] {
  return rows.map(rowToRoot).sort((a, b) => compareRootsArabic(a.root_arabic, b.root_arabic));
}

export async function getAllRoots(db: Client): Promise<Root[]> {
  return orderRoots((await db.execute('SELECT * FROM roots')).rows);
}

/** Materialize hijāʾī rank into roots.sort_order (1..N) so getRootNeighbors is
 *  an indexed O(1) lookup. compareRootsArabic (via orderRoots) stays the single
 *  ordering source — sort_order is a derived cache, invalidated wholesale by the
 *  trg_roots_sort_order_* triggers in schema.sql whenever a root is inserted or
 *  respelled. Returns rows written. */
export async function backfillRootSortOrder(db: Client): Promise<number> {
  // Read and write in one write transaction. Split across two statements, a
  // root inserted between them would fire its invalidation trigger against an
  // already-NULL column (a no-op) and then be missed by the batch, which only
  // knows the stale snapshot -- leaving one NULL rank stranded among live ones
  // with no trigger left to fire. That is precisely the invisible-skip case
  // the whole-column nulling exists to prevent: `sort_order < ?` / `> ?` step
  // straight over it. Atomicity makes the outcome all-ranked or all-NULL,
  // never mixed. Reachable because the web cold start now runs this against
  // the same file the scraper writes.
  const tx = await db.transaction('write');
  try {
    const ordered = orderRoots((await tx.execute('SELECT * FROM roots')).rows);
    if (ordered.length === 0) {
      await tx.rollback();
      return 0;
    }
    // One batch, not a statement per root: against a remote libsql this is 1
    // round trip instead of ~1.6k. tx.batch does not roll back on failure --
    // the finally's close() does that for us.
    await tx.batch(
      ordered.map((r, i) => ({
        sql: 'UPDATE roots SET sort_order = ? WHERE id = ?',
        args: [i + 1, r.id],
      })),
    );
    await tx.commit();
    return ordered.length;
  } finally {
    // No-op once committed/rolled back; releases the write lock if we threw.
    tx.close();
  }
}

/** Rebuild the sort_order cache if anything invalidated it, else do nothing.
 *
 *  The invalidation triggers null the whole column, so one indexed probe for a
 *  NULL rank answers "is the cache dirty" for every root at once. Returns rows
 *  written.
 *
 *  Only meaningful where those triggers exist — call it from the same branch
 *  that installs them (see apps/web/src/lib/db.ts). Without them nothing ever
 *  nulls a rank, so this finds a clean cache forever while stale ranks are
 *  served, which reads as healthy and is not.
 *
 *  The probe is deliberately outside backfillRootSortOrder's transaction: a
 *  write racing it can only cost a redundant rebuild or defer one to the next
 *  cold start, and the rebuild itself is atomic. A scrape landing while the
 *  process is already up is likewise not seen until restart; until then
 *  getRootNeighbors takes its full-sort fallback, slower but never wrong. */
export async function backfillRootSortOrderIfStale(db: Client): Promise<number> {
  const stale = await db.execute('SELECT 1 FROM roots WHERE sort_order IS NULL LIMIT 1');
  if (stale.rows.length === 0) return 0;
  return backfillRootSortOrder(db);
}

/** Hijāʾī-adjacent roots (by root_buckwalter) for prev/next navigation, so the
 *  arrows always agree with the browse list. O(1) via the indexed sort_order
 *  column (backfillRootSortOrder). Falls back to a full compareRootsArabic sort
 *  when sort_order hasn't been backfilled (fresh rebuild), keeping correctness. */
export async function getRootNeighbors(
  db: Client,
  bw: string,
): Promise<{ prev: string | null; next: string | null }> {
  const cur = await db.execute({
    sql: 'SELECT sort_order FROM roots WHERE root_buckwalter = ?',
    args: [bw],
  });
  const rank = cur.rows[0]?.['sort_order'] as number | null | undefined;
  if (rank === null || rank === undefined) {
    // Root missing, or sort_order not backfilled — degrade to the full sort.
    if (cur.rows.length === 0) return { prev: null, next: null };
    const all = await getAllRoots(db);
    const i = all.findIndex((r) => r.root_buckwalter === bw);
    return {
      prev: i > 0 ? all[i - 1]!.root_buckwalter : null,
      next: i < all.length - 1 ? all[i + 1]!.root_buckwalter : null,
    };
  }
  const [prev, next] = await Promise.all([
    db.execute({
      sql: 'SELECT root_buckwalter FROM roots WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1',
      args: [rank],
    }),
    db.execute({
      sql: 'SELECT root_buckwalter FROM roots WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1',
      args: [rank],
    }),
  ]);
  return {
    prev: (prev.rows[0]?.['root_buckwalter'] as string) ?? null,
    next: (next.rows[0]?.['root_buckwalter'] as string) ?? null,
  };
}

/** Slim: just root_arabic for every root — for alphabet letter counts without
 *  reading/sorting full rows when the display list comes from another query. */
export async function getRootArabicList(db: Client): Promise<string[]> {
  const res = await db.execute('SELECT root_arabic FROM roots');
  return res.rows.map((r) => r['root_arabic'] as string);
}

/** Every root plus a concatenated gloss blob, for a one-shot static payload
 *  that the dictionary page's client-side search can filter by meaning
 *  without a per-keystroke server round-trip. */
export async function getRootSearchList(db: Client): Promise<RootSearchItem[]> {
  const res = await db.execute(
    `SELECT r.id, r.root_buckwalter, r.root_arabic, r.occurrence_count,
            GROUP_CONCAT(f.gloss, ' ') AS gloss_blob
     FROM roots r
     LEFT JOIN root_forms f ON f.root_id = r.id
     GROUP BY r.id
     ORDER BY r.root_arabic`,
  );
  return res.rows.map((r) => ({
    id: r['id'] as number,
    root_buckwalter: r['root_buckwalter'] as string,
    root_arabic: r['root_arabic'] as string,
    occurrence_count: r['occurrence_count'] as number,
    gloss_blob: (r['gloss_blob'] as string | null) ?? null,
  }));
}

export async function getRootsByFrequency(db: Client, limit = 200): Promise<Root[]> {
  const res = await db.execute({
    sql: 'SELECT * FROM roots ORDER BY occurrence_count DESC, root_buckwalter LIMIT ?',
    args: [limit],
  });
  return res.rows.map(rowToRoot);
}

export async function searchRoots(db: Client, q: string): Promise<Root[]> {
  const like = `%${q}%`;
  // Arabic is matched on the folded form of BOTH sides: the stored spelling is
  // corpus orthography (`أرض`) but most keyboards produce bare alef first, and
  // a pasted root may still carry inter-letter spaces.
  const arabicLike = `%${foldRootArabic(q)}%`;
  const res = await db.execute({
    sql: `SELECT DISTINCT r.* FROM roots r
          LEFT JOIN root_forms f ON f.root_id = r.id
          WHERE r.root_buckwalter LIKE ?
             OR ${foldRootArabicSql('r.root_arabic')} LIKE ?
             OR f.gloss LIKE ?
          ORDER BY r.occurrence_count DESC LIMIT 100`,
    args: [like, arabicLike, like],
  });
  return res.rows.map(rowToRoot);
}

export async function getRootForms(db: Client, rootId: number): Promise<RootForm[]> {
  const res = await db.execute({
    // form_arabic IS NULL only ever marked See-Also junk (external dictionary
    // links the pre-fix scraper mistook for forms); real forms always carry
    // Arabic. Excluding them keeps the UI's empty-section guard correct.
    sql: 'SELECT * FROM root_forms WHERE root_id = ? AND form_arabic IS NOT NULL ORDER BY sort_order',
    args: [rootId],
  });
  return res.rows.map(rowToForm);
}

/** Preference order for a root's definition sources, best first.
 *
 *  Lane is the full classical lexicon entry; `corpus-forms` is the short gloss
 *  strip harvested from corpus.quran.com to cover roots Lane has nothing for
 *  (phase 20), so it must never outrank a real Lane entry. Plain
 *  `ORDER BY source` used to do the right thing only by alphabetical accident,
 *  and phase 20 broke the accident: `'corpus-forms' < 'lane' < 'qurandev-lane'`
 *  puts the fallback first. The root page shows every source so it only
 *  reorders there, but the lemma page takes `LIMIT 1` off this same order —
 *  there, the accident silently picks the weaker definition.
 *
 *  `perseus-lane` is Lane too, but machine-extracted from the TEI rather than
 *  curated, and phase 21's own `lane_rejects.txt` records that its leading sense
 *  is sometimes one the Quran never uses. So it sits below the curated Lane
 *  sources and above the `corpus-forms` strip. Leaving it tied at 0 would have
 *  let the `rd.source` tie-break decide alphabetically — `perseus-lane` beats
 *  `qurandev-lane` — which is the same accident the rest of this comment exists
 *  to have removed. No root carries both today; the ordering is what stops the
 *  first one that does from silently rendering the weaker gloss.
 *
 *  Shared so the two pages cannot disagree about which definition is "the"
 *  definition for a root.
 */
export const DEFINITION_SOURCE_RANK = `CASE rd.source
       WHEN 'lane' THEN 0
       WHEN 'qurandev-lane' THEN 0
       WHEN 'perseus-lane' THEN 1
       WHEN 'corpus-forms' THEN 2
       ELSE 3
     END, rd.source`;

export async function getRootDefinitions(
  db: Client,
  rootId: number,
): Promise<RootDefinition[]> {
  const res = await db.execute({
    sql: `SELECT rd.* FROM root_definitions rd
          WHERE rd.root_id = ?
          ORDER BY ${DEFINITION_SOURCE_RANK}`,
    args: [rootId],
  });
  return res.rows.map(rowToDefinition);
}

export async function getRootEntry(db: Client, bw: string): Promise<RootEntry | null> {
  const root = await getRootByBuckwalter(db, bw);
  if (!root) return null;
  const [forms, definitions] = await Promise.all([
    getRootForms(db, root.id),
    getRootDefinitions(db, root.id),
  ]);
  return { root, forms, definitions };
}

export interface ConcordancePageOpts {
  /** Omit for the full, unbounded list; set for server-side paging. */
  limit?: number;
  offset?: number;
  lang?: string;
  batchSize?: number;
  /** root_forms.id values to narrow to (OR semantics). Omit/empty = no filter. */
  formIds?: number[];
}

/** Total matched occurrences for a root — the paging total, cheap COUNT with no
 *  verse rebuild. One row per matching word (EXISTS, no join fan-out), so this
 *  equals the entry count of the concordance.
 *  ponytail: word-based count. If a single word ever carried the same root in
 *  two segments, this would read one under roots.occurrence_count (segment-based);
 *  no such word exists in the corpus. Revisit only if that changes.
 *  `formIds` narrows to occurrences whose lemma matches one of those
 *  root_forms rows; omitted/empty keeps the original fast unfiltered query
 *  (no join) so the common "All" case doesn't pay for a feature it doesn't use. */
export async function countRootConcordance(
  db: Client,
  bw: string,
  formIds?: number[],
): Promise<number> {
  if (!formIds || formIds.length === 0) {
    // Driven from word_segments (indexed on root, ~hundreds of rows even for a
    // hot root) rather than a correlated EXISTS over all `words` -- the EXISTS
    // form makes SQLite scan every word in the corpus and re-run the root
    // lookup per row, which is O(words x matches) and took 10s+ on common roots.
    const res = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM (SELECT DISTINCT word_id FROM word_segments WHERE root = ?)`,
      args: [bw],
    });
    return res.rows[0]!['n'] as number;
  }
  const placeholders = formIds.map(() => '?').join(',');
  const res = await db.execute({
    // EXISTS, not a JOIN, against root_forms -- a handful of roots have two
    // root_forms rows sharing the same form_arabic (e.g. مَٰلِك), and a JOIN
    // there would fan out and double-count a word matching both.
    sql: `SELECT COUNT(*) AS n FROM (
            SELECT m.word_id
            FROM (SELECT word_id, MIN(segment_index) AS seg_idx
                  FROM word_segments WHERE root = ? GROUP BY word_id) m
            JOIN word_segments ws ON ws.word_id = m.word_id AND ws.segment_index = m.seg_idx
            WHERE EXISTS (
              SELECT 1 FROM root_forms rf
               WHERE rf.root_id = (SELECT id FROM roots WHERE root_buckwalter = ?)
                 AND rf.form_arabic = ws.lemma
                 AND rf.id IN (${placeholders})
            )
          )`,
    args: [bw, bw, ...formIds],
  });
  return res.rows[0]!['n'] as number;
}

/** One page of a root's concordance (or all of it when `limit` is omitted).
 *  Deterministic surah→ayah→position order so LIMIT/OFFSET paging never repeats
 *  or skips an occurrence. Always LEFT JOINs each occurrence's lemma to its
 *  matching root_forms row (via exact text match, scoped to this root by an
 *  inline subquery -- no extra required param) so `form_id` can tag it;
 *  `opts.formIds` additionally narrows to specific forms when provided. */
export async function getRootConcordancePage(
  db: Client,
  bw: string,
  opts: ConcordancePageOpts = {},
): Promise<ConcordanceEntry[]> {
  const { limit, offset = 0, lang = 'en', batchSize = 500, formIds } = opts;
  assertPagingBounds(limit, offset);
  const args: (string | number)[] = [bw, bw, lang];
  let filterClause = '';
  if (formIds && formIds.length > 0) {
    const placeholders = formIds.map(() => '?').join(',');
    filterClause = ` WHERE EXISTS (
            SELECT 1 FROM root_forms rf
             WHERE rf.root_id = (SELECT id FROM rid)
               AND rf.form_arabic = ws.lemma
               AND rf.id IN (${placeholders})
          )`;
    args.push(...formIds);
  }
  let paging = '';
  if (limit !== undefined) {
    paging = ' LIMIT ? OFFSET ?';
    args.push(limit, offset);
  }
  const matched = await db.execute({
    // Same fix as countRootConcordance: drive from the root-indexed
    // word_segments rows, not a correlated EXISTS scanning every word.
    // MIN(segment_index) picks a deterministic segment for the rare
    // double-stem-same-root case (same tie-break as the words.pos_tag fix).
    // form_id is a scalar subquery (MIN, not a JOIN) -- a handful of roots
    // have two root_forms rows sharing the same form_arabic (e.g. مَٰلِك),
    // and joining directly on that column would fan out and duplicate the
    // occurrence row. The filter clause uses EXISTS for the same reason.
    sql: `WITH rid AS (SELECT id FROM roots WHERE root_buckwalter = ?)
          SELECT a.surah_id, a.ayah_number, w.position, w.id AS word_id,
                 w.ayah_id AS ayah_id, w.text_arabic, w.transliteration,
                 g.gloss_text AS gloss,
                 (SELECT MIN(rf.id) FROM root_forms rf
                   WHERE rf.root_id = (SELECT id FROM rid)
                     AND rf.form_arabic = ws.lemma) AS form_id
          FROM (SELECT word_id, MIN(segment_index) AS seg_idx
                FROM word_segments WHERE root = ? GROUP BY word_id) m
          JOIN word_segments ws ON ws.word_id = m.word_id AND ws.segment_index = m.seg_idx
          JOIN words w ON w.id = m.word_id
          JOIN ayahs a ON a.id = w.ayah_id
          LEFT JOIN word_glosses g ON g.word_id = w.id AND g.language_code = ?${filterClause}
          ORDER BY a.surah_id, a.ayah_number, w.position${paging}`,
    args,
  });
  if (matched.rows.length === 0) return [];

  const ayahIds = [...new Set(matched.rows.map((r) => r['ayah_id'] as number))];
  const wordsByAyah = await buildVerseWordsByAyah(db, ayahIds, batchSize);

  return matched.rows.map((r) => ({
    surah_id: r['surah_id'] as number,
    ayah_number: r['ayah_number'] as number,
    position: r['position'] as number,
    word_id: r['word_id'] as number,
    text_arabic: stripQuranicAnnotations(r['text_arabic'] as string),
    transliteration: (r['transliteration'] as string | null) ?? null,
    gloss: (r['gloss'] as string | null) ?? null,
    form_id: (r['form_id'] as number | null) ?? null,
    verse_words: wordsByAyah.get(r['ayah_id'] as number) ?? [],
  }));
}

/** Full concordance for a root (unbounded). Thin wrapper over the paged query. */
export async function getRootConcordance(
  db: Client,
  bw: string,
  lang = 'en',
  batchSize = 500,
): Promise<ConcordanceEntry[]> {
  return getRootConcordancePage(db, bw, { lang, batchSize });
}
