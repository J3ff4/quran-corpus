import type { QueryClient } from '../queryClient.js';
import type { WordHit } from '../types.js';
import {
  buildFtsMatch,
  foldUzScript,
  MAX_QUERY_LENGTH,
  normalizeArabic,
  stripQuranicAnnotations,
} from '../text/normalize.js';
import { markGlossMatches } from '../text/glossMatch.js';

export const WORD_HIT_LIMIT = 50;
const MIN_QUERY_CHARS = 3;
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const sameLang = (a: string, b: string) => foldUzScript(a) === foldUzScript(b);
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface Group {
  key: string;
  lemmaBw: string | null;
  arabic: string;
  count: number;
  firstId: number;
  surfaces: string[];
}

/** Words whose gloss matches, one row per lemma (R16/R17). Two FTS passes, both on the
 *  bound MATCH: the first groups and ranks; the second reads glosses for the top 50
 *  only, so a stopword query ("the*": 2,307 groups) never ships every gloss row to JS.
 *  Measured on the server: 39 ms worst case. */
export async function searchWords(
  db: QueryClient,
  q: string,
  glossLanguage?: string,
): Promise<WordHit[]> {
  const term = q.trim();
  if (term.length < MIN_QUERY_CHARS || term.length > MAX_QUERY_LENGTH || ARABIC.test(term)) {
    return [];
  }
  const match = buildFtsMatch(term);

  const grouped = await db.execute({
    sql: `SELECT w.lemma_buckwalter AS lemma_bw,
                 CASE WHEN w.lemma_buckwalter IS NULL THEN w.text_arabic END AS surface,
                 MIN(w.lemma) AS lemma, MIN(w.text_arabic) AS text_arabic,
                 COUNT(DISTINCT w.id) AS n, MIN(w.id) AS first_id
          FROM word_gloss_fts f
          JOIN word_glosses g ON g.id = f.rowid
          JOIN words w ON w.id = g.word_id
          WHERE word_gloss_fts MATCH ?
          GROUP BY w.lemma_buckwalter, surface`,
    args: [match],
  });
  const groups = new Map<string, Group>();
  for (const r of grouped.rows) {
    const lemmaBw = r['lemma_bw'] as string | null;
    const surface = r['surface'] as string | null;
    // A lemma-less word has no shared key, so its harakat-free surface is the key.
    const key = lemmaBw ?? `~${normalizeArabic(surface ?? '')}`;
    const n = r['n'] as number;
    const firstId = r['first_id'] as number;
    const arabic = (lemmaBw != null ? (r['lemma'] as string | null) : null) ?? (r['text_arabic'] as string);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { key, lemmaBw, arabic, count: n, firstId, surfaces: surface != null ? [surface] : [] });
      continue;
    }
    // Only lemma-less keys repeat. Their raw surfaces are disjoint word sets, so the
    // distinct counts add exactly.
    g.count += n;
    if (surface != null) g.surfaces.push(surface);
    if (firstId < g.firstId) {
      g.firstId = firstId;
      g.arabic = arabic;
    }
  }
  const top = [...groups.values()]
    .sort((a, b) => b.count - a.count || cmp(a.key, b.key))
    .slice(0, WORD_HIT_LIMIT);
  if (top.length === 0) return [];

  // `!= null`, never truthiness: '' is a real key (a wiped text_arabic, say), and a
  // key missing from both lists would leave its row with no gloss.
  const lemmas = top.flatMap((g) => (g.lemmaBw != null ? [g.lemmaBw] : []));
  const surfaces = top.flatMap((g) => (g.lemmaBw != null ? [] : g.surfaces));
  const ids = top.map((g) => g.firstId);
  const [glossRows, firstRows] = await Promise.all([
    db.execute({
      sql: `SELECT w.lemma_buckwalter AS lemma_bw, w.text_arabic AS surface,
                   g.language_code AS lang, g.gloss_text AS gloss, COUNT(*) AS c
            FROM word_gloss_fts f
            JOIN word_glosses g ON g.id = f.rowid
            JOIN words w ON w.id = g.word_id
            WHERE word_gloss_fts MATCH ?
              AND (w.lemma_buckwalter IN (${marks(lemmas.length)})
                   OR (w.lemma_buckwalter IS NULL AND w.text_arabic IN (${marks(surfaces.length)})))
            GROUP BY w.lemma_buckwalter, w.text_arabic, g.language_code, g.gloss_text`,
      args: [match, ...lemmas, ...surfaces],
    }),
    db.execute({
      sql: `SELECT w.id, a.surah_id, a.ayah_number, w.position
            FROM words w JOIN ayahs a ON a.id = w.ayah_id WHERE w.id IN (${marks(ids.length)})`,
      args: ids,
    }),
  ]);

  // Best gloss per key: exact content language, then the same language in the other
  // script, then any; within a tier the most frequent, then alphabetical, then by
  // language so one spelling in two languages does not resolve by SQL row order.
  const tier = (lang: string) =>
    !glossLanguage ? 2 : lang === glossLanguage ? 0 : sameLang(lang, glossLanguage) ? 1 : 2;
  const counts = new Map<string, Map<string, { lang: string; gloss: string; c: number }>>();
  for (const r of glossRows.rows) {
    const lemmaBw = r['lemma_bw'] as string | null;
    const key = lemmaBw ?? `~${normalizeArabic(r['surface'] as string)}`;
    const lang = r['lang'] as string;
    const gloss = r['gloss'] as string;
    const per = counts.get(key) ?? new Map<string, { lang: string; gloss: string; c: number }>();
    const cell = per.get(`${lang}\u0000${gloss}`) ?? { lang, gloss, c: 0 };
    cell.c += r['c'] as number;
    per.set(`${lang}\u0000${gloss}`, cell);
    counts.set(key, per);
  }
  const first = new Map(firstRows.rows.map((r) => [r['id'] as number, r]));

  return top.map((g) => {
    const best = [...(counts.get(g.key)?.values() ?? [])].sort(
      (a, b) =>
        tier(a.lang) - tier(b.lang) || b.c - a.c || cmp(a.gloss, b.gloss) || cmp(a.lang, b.lang),
    )[0]!;
    const at = first.get(g.firstId)!;
    return {
      lemma_buckwalter: g.lemmaBw,
      arabic: stripQuranicAnnotations(g.arabic),
      gloss: markGlossMatches(best.gloss, term),
      gloss_lang: glossLanguage && sameLang(best.lang, glossLanguage) ? null : best.lang,
      count: g.count,
      surah_id: at['surah_id'] as number,
      ayah_number: at['ayah_number'] as number,
      position: at['position'] as number,
    };
  });
}
