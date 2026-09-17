import type { QueryClient, QueryRow } from '../queryClient.js';
import type { WordGloss } from '../types.js';

function rowToWordGloss(row: QueryRow): WordGloss {
  return {
    id: row['id'] as number,
    word_id: row['word_id'] as number,
    language_code: row['language_code'] as string,
    gloss_text: row['gloss_text'] as string,
  };
}

export async function getGlossesBySurahAndLang(
  db: QueryClient,
  surahId: number,
  languageCode: string,
): Promise<WordGloss[]> {
  const result = await db.execute({
    sql: `SELECT g.*
          FROM word_glosses g
          JOIN words w ON w.id = g.word_id
          JOIN ayahs a ON a.id = w.ayah_id
          WHERE a.surah_id = ? AND g.language_code = ?`,
    args: [surahId, languageCode],
  });
  return result.rows.map(rowToWordGloss);
}

export interface GlossWithLang {
  word_id: number;
  gloss_text: string;
  gloss_lang: string;
  /** Which phrase this word belongs to, from the preferred-language row.
   *  Words sharing a group are ONE gloss and render once across the span.
   *  NULL for every ungrouped source, and always for a fallback row.
   *
   *  A fallback row's own group id is deliberately dropped rather than passed
   *  through. Group ids are scoped per (ayah, language_code), so two languages
   *  number their phrases independently: a word taking group 5 from `lang` next
   *  to a word taking group 5 from `fallback` are unrelated phrases, and the
   *  renderer -- which joins adjacent cells sharing an id -- would merge them
   *  into one span under one language's gloss. Dropping the id costs a grouped
   *  fallback its spans (each word renders the phrase separately); keeping it
   *  would corrupt the reading. Inert while `fallback` is 'en', which carries
   *  no groups at all, and that is exactly why it must be written down. */
  gloss_group: number | null;
}

/** One gloss per word for a surah: the requested lang where a row exists,
 *  else the fallback lang (default 'en'), tagged with which lang was used so
 *  the UI can mark a fallback. When lang === fallback the tag is always that. */
export async function getGlossesWithFallback(
  db: QueryClient,
  surahId: number,
  lang: string,
  fallback = 'en',
): Promise<GlossWithLang[]> {
  const result = await db.execute({
    sql: `SELECT w.id AS word_id,
                 COALESCE(pref.gloss_text, fb.gloss_text) AS gloss_text,
                 CASE WHEN pref.gloss_text IS NOT NULL THEN ? ELSE ? END AS gloss_lang,
                 CASE WHEN pref.gloss_text IS NOT NULL
                      THEN pref.gloss_group ELSE NULL END AS gloss_group
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          LEFT JOIN word_glosses pref ON pref.word_id = w.id AND pref.language_code = ?
          LEFT JOIN word_glosses fb   ON fb.word_id   = w.id AND fb.language_code = ?
          WHERE a.surah_id = ?
            AND COALESCE(pref.gloss_text, fb.gloss_text) IS NOT NULL`,
    args: [lang, fallback, lang, fallback, surahId],
  });
  return result.rows.map((r) => ({
    word_id: r['word_id'] as number,
    gloss_text: r['gloss_text'] as string,
    gloss_lang: r['gloss_lang'] as string,
    gloss_group: (r['gloss_group'] as number | null) ?? null,
  }));
}
