import type { QueryClient } from '../queryClient.js';
import type { LemmaFrequencyEntry, VerbConcordanceEntry } from '../types.js';
import { stripQuranicAnnotations } from '../text/normalize.js';

export async function getLemmaFrequency(
  db: QueryClient,
  limit = 200,
): Promise<LemmaFrequencyEntry[]> {
  const res = await db.execute({
    // MIN(lemma), not a bare `lemma`: under GROUP BY lemma_buckwalter a bare
    // column resolves to an arbitrary row of the group, so a lemma written two
    // ways in the corpus could label its row with a spelling that is not the
    // one on the page the row opens. Same rule getVerbConcordance below
    // documents; these rows are links on mobile too now.
    sql: `SELECT MIN(lemma) AS lemma, lemma_buckwalter, COUNT(*) AS count
          FROM words
          WHERE lemma_buckwalter IS NOT NULL
          GROUP BY lemma_buckwalter
          ORDER BY count DESC, lemma_buckwalter
          LIMIT ?`,
    args: [limit],
  });
  return res.rows.map((r) => ({
    lemma: (r['lemma'] as string | null) ?? (r['lemma_buckwalter'] as string),
    lemma_buckwalter: (r['lemma_buckwalter'] as string | null) ?? null,
    count: r['count'] as number,
  }));
}

export async function getVerbConcordance(
  db: QueryClient,
  limit = 200,
): Promise<VerbConcordanceEntry[]> {
  const res = await db.execute({
    // `text_arabic` is the surface form of ONE occurrence, and a verb lemma has
    // many. Read as a bare column under GROUP BY it resolved to an arbitrary
    // row, so the table could label قَالَ's row يَقُولُ -- and since these rows
    // are now links, that label disagreed with the lemma page it opens. Same
    // arbitrary-row hazard getLemmaEntry documents; same fix, the modal form.
    // MIN(lemma) for the same reason (0 multi-surface lemmas live, so this is
    // equivalent today -- it just stops depending on that staying true).
    sql: `SELECT MIN(lemma) AS lemma, lemma_buckwalter, COUNT(*) AS count,
                 (SELECT w2.text_arabic
                    FROM words w2
                   WHERE w2.lemma_buckwalter = w.lemma_buckwalter
                     AND w2.pos_tag = 'V'
                   GROUP BY w2.text_arabic
                   ORDER BY COUNT(*) DESC, w2.text_arabic
                   LIMIT 1) AS text_arabic
          FROM words w
          WHERE pos_tag = 'V' AND lemma_buckwalter IS NOT NULL
          GROUP BY lemma_buckwalter
          ORDER BY count DESC, lemma_buckwalter
          LIMIT ?`,
    args: [limit],
  });
  return res.rows.map((r) => ({
    lemma: (r['lemma'] as string | null) ?? null,
    lemma_buckwalter: (r['lemma_buckwalter'] as string | null) ?? null,
    form_arabic: stripQuranicAnnotations(r['text_arabic'] as string),
    count: r['count'] as number,
  }));
}

/** Which of the two frequency rankings a lemma is being paged through. The
 *  same lemma sits at a different rank in each, because the verb list counts
 *  only its verb occurrences. */
export type LemmaFrequencyKind = 'lemmas' | 'verbs';

/** The lemmas either side of `lemmaBuckwalter` in one of the two frequency
 *  rankings, for the lemma screen's Previous/Next.
 *
 *  Two things here are load-bearing:
 *
 *  1. The ordering is byte-identical to `getLemmaFrequency` /
 *     `getVerbConcordance` (`count DESC, lemma_buckwalter`), tie-break
 *     included. A different tie-break makes Next skip or repeat rows.
 *  2. There is deliberately no LIMIT. Both list queries default to 200 rows,
 *     but the list scrolls well past that, and a neighbour lookup built on the
 *     truncated list would come up empty for exactly the rows a reader had to
 *     scroll furthest to reach.
 *
 *  `kind` picks between two literal fragments; it is never interpolated into
 *  SQL, so a caller passing a hostile value gets a type error, not a query. */
export async function getLemmaFrequencyNeighbors(
  db: QueryClient,
  lemmaBuckwalter: string,
  kind: LemmaFrequencyKind,
): Promise<{ prev: string | null; next: string | null }> {
  const agg =
    kind === 'verbs'
      ? `SELECT lemma_buckwalter AS bw, COUNT(*) AS count FROM words
         WHERE pos_tag = 'V' AND lemma_buckwalter IS NOT NULL GROUP BY lemma_buckwalter`
      : `SELECT lemma_buckwalter AS bw, COUNT(*) AS count FROM words
         WHERE lemma_buckwalter IS NOT NULL GROUP BY lemma_buckwalter`;

  const cur = await db.execute({
    sql: `WITH agg AS (${agg}) SELECT count FROM agg WHERE bw = ?`,
    args: [lemmaBuckwalter],
  });
  // Not in this ranking at all: a noun reached with ?from=verbs, or a lemma
  // the corpus does not carry. Both arrive here off a deep link.
  if (cur.rows.length === 0) return { prev: null, next: null };
  const count = cur.rows[0]!['count'] as number;

  const [prev, next] = await Promise.all([
    // One row EARLIER in `count DESC, bw ASC`: a higher count, or the same
    // count and an earlier bw. Read back nearest-first, hence the reversed
    // ORDER BY.
    db.execute({
      sql: `WITH agg AS (${agg})
            SELECT bw FROM agg
            WHERE count > ? OR (count = ? AND bw < ?)
            ORDER BY count ASC, bw DESC LIMIT 1`,
      args: [count, count, lemmaBuckwalter],
    }),
    db.execute({
      sql: `WITH agg AS (${agg})
            SELECT bw FROM agg
            WHERE count < ? OR (count = ? AND bw > ?)
            ORDER BY count DESC, bw ASC LIMIT 1`,
      args: [count, count, lemmaBuckwalter],
    }),
  ]);

  return {
    prev: (prev.rows[0]?.['bw'] as string) ?? null,
    next: (next.rows[0]?.['bw'] as string) ?? null,
  };
}
