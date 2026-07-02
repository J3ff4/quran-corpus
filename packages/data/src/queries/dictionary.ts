import type { Client } from '@libsql/client';
import type { LemmaFrequencyEntry, VerbConcordanceEntry } from '../types.js';

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
    sql: `SELECT lemma, lemma_buckwalter, text_arabic, COUNT(*) AS count
          FROM words
          WHERE pos_tag = 'V'
          GROUP BY lemma_buckwalter
          ORDER BY count DESC, lemma_buckwalter
          LIMIT ?`,
    args: [limit],
  });
  return res.rows.map((r) => ({
    lemma: (r['lemma'] as string | null) ?? null,
    form_arabic: r['text_arabic'] as string,
    count: r['count'] as number,
  }));
}
