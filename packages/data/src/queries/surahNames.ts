import type { QueryClient } from '../queryClient.js';

export interface SurahName {
  name: string;
  meaning: string | null;
}

/** Every surah's name in one language, keyed by surah id.
 *
 *  Falls back per surah to the `surahs` row (`name_translit` /
 *  `name_translation`), so the map always covers all 114 and no call site
 *  needs a fallback of its own. A language whose name set is partial -- or
 *  absent entirely, which is every language but Uzbek today -- still reads.
 *
 *  `meaning` stays NULL where a translator had none, and where it would only
 *  repeat the name (Tavba/Tavba); the UI shows the name alone, not an echo. */
export async function getSurahNames(
  db: QueryClient,
  lang: string,
): Promise<Map<number, SurahName>> {
  const result = await db.execute({
    sql: `SELECT s.id AS surah_id,
                 COALESCE(n.name, s.name_translit) AS name,
                 CASE WHEN n.name IS NOT NULL
                      THEN n.meaning ELSE s.name_translation END AS meaning
          FROM surahs s
          LEFT JOIN surah_names n ON n.surah_id = s.id AND n.language_code = ?
          ORDER BY s.id`,
    args: [lang],
  });
  return new Map(
    result.rows.map((r) => [
      r['surah_id'] as number,
      {
        name: r['name'] as string,
        meaning: (r['meaning'] as string | null) ?? null,
      },
    ]),
  );
}
