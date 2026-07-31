import type { Client } from '@libsql/client';
import type { LemmaFrequencyEntry, VerbConcordanceEntry } from '../types.js';
import { stripQuranicAnnotations } from '../text/normalize.js';

export async function getLemmaFrequency(
  db: Client,
  limit = 200,
): Promise<LemmaFrequencyEntry[]> {
  const res = await db.execute({
    sql: `SELECT lemma, lemma_buckwalter, COUNT(*) AS count
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
  db: Client,
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
