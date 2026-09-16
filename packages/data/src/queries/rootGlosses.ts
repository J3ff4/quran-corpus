import type { QueryClient } from '../queryClient.js';

export interface RootGloss {
  gloss: string;
  occurrence_count: number;
}

/** A root's glosses in one language, most frequent first.
 *
 *  Derived from the word-by-word glosses rather than translated from a
 *  lexicon, so the list is empty for any language with no word-by-word set --
 *  which is every language but Uzbek. Callers show the English Lane / Hans
 *  Wehr article regardless; this list sits above it, it does not replace it. */
export async function getRootGlosses(
  db: QueryClient,
  rootId: number,
  lang: string,
): Promise<RootGloss[]> {
  const result = await db.execute({
    sql: `SELECT gloss, occurrence_count
          FROM root_glosses
          WHERE root_id = ? AND language_code = ?
          ORDER BY rank`,
    args: [rootId, lang],
  });
  return result.rows.map((r) => ({
    gloss: r['gloss'] as string,
    occurrence_count: r['occurrence_count'] as number,
  }));
}
