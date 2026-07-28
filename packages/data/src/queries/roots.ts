import type { Client, Row } from '@libsql/client';
import type {
  Root,
  RootForm,
  RootDefinition,
  RootEntry,
  ConcordanceEntry,
  VerseWord,
  RootSearchItem,
} from '../types.js';
import { compareRootsArabic, foldRootArabic, foldRootArabicSql } from '../text/arabic.js';
import { stripQuranicAnnotations } from '../text/normalize.js';

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

export async function getAllRoots(db: Client): Promise<Root[]> {
  const res = await db.execute('SELECT * FROM roots');
  return res.rows.map(rowToRoot).sort((a, b) => compareRootsArabic(a.root_arabic, b.root_arabic));
}

/** Materialize hijāʾī rank into roots.sort_order (1..N) so getRootNeighbors is
 *  an indexed O(1) lookup. compareRootsArabic (via getAllRoots) stays the single
 *  ordering source — sort_order is a derived cache, so re-run this whenever the
 *  roots set changes (post-scrape / after any roots insert). Returns rows written. */
export async function backfillRootSortOrder(db: Client): Promise<number> {
  const ordered = await getAllRoots(db);
  if (ordered.length === 0) return 0;
  await db.batch(
    ordered.map((r, i) => ({
      sql: 'UPDATE roots SET sort_order = ? WHERE id = ?',
      args: [i + 1, r.id],
    })),
    'write',
  );
  return ordered.length;
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

export async function getRootDefinitions(
  db: Client,
  rootId: number,
): Promise<RootDefinition[]> {
  const res = await db.execute({
    sql: 'SELECT * FROM root_definitions WHERE root_id = ? ORDER BY source',
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
  // Batch the IN clause: a hot root (الله ~1879 ayahs) would otherwise emit
  // more binds than SQLite's SQLITE_LIMIT_VARIABLE_NUMBER (999 pre-3.32).
  const wordsByAyah = new Map<number, VerseWord[]>();
  for (let i = 0; i < ayahIds.length; i += batchSize) {
    const chunk = ayahIds.slice(i, i + batchSize);
    const placeholders = chunk.map(() => '?').join(',');
    const sib = await db.execute({
      sql: `SELECT w.ayah_id, w.id, w.position, w.text_arabic,
                   EXISTS (SELECT 1 FROM word_segments s
                           WHERE s.word_id = w.id
                             AND s.segment_index = (SELECT MIN(segment_index) FROM word_segments WHERE word_id = w.id)
                             AND s.pos_tag IN ('SUB','REM')) AS starts_clause
            FROM words w
            WHERE w.ayah_id IN (${placeholders})
            ORDER BY w.ayah_id, w.position`,
      args: chunk,
    });
    for (const r of sib.rows) {
      const aid = r['ayah_id'] as number;
      const list = wordsByAyah.get(aid) ?? [];
      list.push({
        id: r['id'] as number,
        position: r['position'] as number,
        text_arabic: stripQuranicAnnotations(r['text_arabic'] as string),
        starts_clause: (r['starts_clause'] as number) === 1,
      });
      wordsByAyah.set(aid, list);
    }
  }

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
