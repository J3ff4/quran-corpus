import type { Client } from '@libsql/client';
import type { ConcordanceEntry, LemmaEntry } from '../types.js';
import type { ConcordancePageOpts } from './roots.js';
import { DEFINITION_SOURCE_RANK } from './roots.js';
import { stripQuranicAnnotations } from '../text/normalize.js';
import { cleanGlossList } from '../text/gloss.js';
import { buckwalterToArabic } from '../text/arabic.js';
import { posLabelEn } from '../morphology/decode.js';
import { assertPagingBounds, buildVerseWordsByAyah } from './concordance.js';

/** Paging options for a lemma concordance. Deliberately excludes `formIds`
 *  (root-form chips have no lemma analogue) so a caller cannot pass a filter
 *  the query would silently ignore -- it is a compile error instead. */
export type LemmaConcordanceOpts = Omit<ConcordancePageOpts, 'formIds'>;

/** How many "Translated as" gloss chips the lemma page shows. Five covers the
 *  common senses of a polysemous particle without turning the header into a
 *  wall -- مَا's top five are "what", "And not", "and what", "of what", "Not". */
export const LEMMA_GLOSS_LIMIT = 5;

/** Representative row + occurrence count + gloss chips + sense breakdown +
 *  root definition for a lemma.
 *
 *  Only `lemma` and `root_buckwalter` are genuinely constant per
 *  `lemma_buckwalter` (verified live: 0 lemmas with >1 surface form, 0 with >1
 *  root), so those two can be read as bare columns off the GROUP BY.
 *  **`transliteration` and `pos_tag` are not** -- they describe the *occurrence*,
 *  not the lemma: 2349 of 4832 lemmas carry more than one transliteration and
 *  304 more than one POS tag, because every inflected and prefixed occurrence
 *  shares the lemma. Read as bare columns they resolved to an arbitrary row,
 *  which rendered مَا with the transliteration `bimā` -- a form that still has
 *  its bi- prefix attached -- and the pick could flip on any re-import.
 *
 *  `transliteration` is now the most frequent (transliteration, pos_tag)
 *  **pair**, taken together rather than as each column's own mode so the two
 *  can never come from different occurrences. That makes the value *stable*,
 *  and often the citation form (`min`/P, `mā`/REL, `qāla`/V, `kāna`/V, `fī`/P,
 *  `inna`/ACC).
 *
 *  ponytail: mode is a heuristic, not a lemma dictionary, and it does NOT
 *  always reach the citation form. Of the eight most frequent lemmas, two miss:
 *  `{ll~ah` → `l-lahi` (genitive, `l-` proclitic still attached) and `{l~a*iY`
 *  → `alladhīna` (plural for a singular lemma); `samaA^'` → `l-samāwāti`
 *  likewise. So this trades an *arbitrary* wrong form for a *predictable* one,
 *  which is the part that matters for a URL-addressable page -- it does not
 *  claim to be right. Upgrade path is a real citation-form column on a lemma
 *  table, which the corpus does not currently give us.
 *
 *  **POS is no longer collapsed to that pair's tag.** Reporting only the modal
 *  tag stated "Relative pronoun" for مَا, which is wrong for 911 of its 2177
 *  occurrences (NEG 704, INTG 92, SUB 79, COND 23, SUP 13). `senses` returns
 *  the full breakdown and the header renders all of it. */
export async function getLemmaEntry(
  db: Client,
  lemmaBw: string,
  lang = 'en',
): Promise<LemmaEntry | null> {
  const res = await db.execute({
    sql: `SELECT MIN(lemma) AS lemma, root_buckwalter, COUNT(*) AS count
          FROM words
          WHERE lemma_buckwalter = ?
          GROUP BY lemma_buckwalter
          LIMIT 1`,
    args: [lemmaBw],
  });
  const row = res.rows[0];
  if (!row) return null;

  // Modal (transliteration, pos_tag) pair -- see the header note. Tie-broken on
  // the transliteration text so the result is stable across query plans.
  const formRes = await db.execute({
    sql: `SELECT transliteration, pos_tag
          FROM words
          WHERE lemma_buckwalter = ?
          GROUP BY transliteration, pos_tag
          ORDER BY COUNT(*) DESC, transliteration, pos_tag
          LIMIT 1`,
    args: [lemmaBw],
  });
  const formRow = formRes.rows[0];

  const rootBw = (row['root_buckwalter'] as string | null) ?? null;

  const [glossRes, sensesRes, defRes] = await Promise.all([
    db.execute({
      // Over-fetch: cleanGlossList collapses case/punctuation variants
      // ("what" / "What" / "what,") that are distinct rows here, so asking for
      // exactly LEMMA_GLOSS_LIMIT would return fewer chips than that after
      // de-duplication. 4x is comfortably past the worst observed collapse
      // ratio and still one small indexed scan.
      sql: `SELECT g.gloss_text
            FROM words w
            JOIN word_glosses g ON g.word_id = w.id
            WHERE w.lemma_buckwalter = ? AND g.language_code = ?
            GROUP BY g.gloss_text
            ORDER BY COUNT(*) DESC, g.gloss_text
            LIMIT ?`,
      args: [lemmaBw, lang, LEMMA_GLOSS_LIMIT * 4],
    }),
    db.execute({
      // Tie-broken on pos_tag so equal-count senses keep a stable order across
      // query plans (same reason the modal-pair query tie-breaks).
      //
      // `<> ''` as well as `IS NOT NULL`: the column is nullable and untyped
      // beyond that, and an empty tag renders as a bordered chip holding a
      // colour dot, no label and a bare count. No such row exists today, so
      // this is a guard, not a fix.
      sql: `SELECT pos_tag, COUNT(*) AS n
            FROM words
            WHERE lemma_buckwalter = ? AND pos_tag IS NOT NULL AND pos_tag <> ''
            GROUP BY pos_tag
            ORDER BY n DESC, pos_tag`,
      args: [lemmaBw],
    }),
    rootBw
      ? db.execute({
          // Shares getRootDefinitions' ordering (roots.ts) so a root with
          // several definition sources shows the SAME first definition here as
          // on /dictionary/[root]; without it LIMIT 1 is nondeterministic and
          // the two pages can disagree (or flip per request). `source` comes
          // back with it because this page has to credit whatever it renders
          // (§11) and only the row itself knows which source won.
          sql: `SELECT rd.definition, rd.source
                FROM roots r
                JOIN root_definitions rd ON rd.root_id = r.id
                WHERE r.root_buckwalter = ?
                ORDER BY ${DEFINITION_SOURCE_RANK}
                LIMIT 1`,
          args: [rootBw],
        })
      : Promise.resolve(null),
  ]);

  return {
    // MIN(lemma) is null only if every occurrence has a null surface `lemma`
    // (none in the current corpus, unenforced by schema). Fall back to the
    // buckwalter key transliterated back to Arabic script -- the header renders
    // it in the RTL Arabic display face, so a raw Latin Buckwalter fallback
    // would look broken there. buckwalterToArabic passes unmapped chars through
    // unchanged, so even a partial token reads as Arabic, not Latin.
    lemma: (row['lemma'] as string | null) ?? buckwalterToArabic(lemmaBw),
    lemma_buckwalter: lemmaBw,
    transliteration: (formRow?.['transliteration'] as string | null) ?? null,
    root_buckwalter: rootBw,
    count: row['count'] as number,
    senses: sensesRes.rows.map((r) => {
      const tag = r['pos_tag'] as string;
      return {
        pos_tag: tag,
        // posLabelEn already falls back to the raw tag for one it has no
        // English label for; it returns null only for a falsy tag, which the
        // WHERE clause above now excludes. So `?? tag` is unreachable in
        // practice and exists to satisfy the `string | null` return type
        // without a non-null assertion -- an assertion would type a null as
        // `string` and render a bare count with no label at all.
        pos_label: posLabelEn(tag) ?? tag,
        count: r['n'] as number,
      };
    }),
    top_glosses: cleanGlossList(
      glossRes.rows.map((r) => r['gloss_text'] as string),
      LEMMA_GLOSS_LIMIT,
    ),
    root_definition: (defRes?.rows[0]?.['definition'] as string | null) ?? null,
    root_definition_source: (defRes?.rows[0]?.['source'] as string | null) ?? null,
  };
}

/** Total matched occurrences for a lemma -- the paging total, cheap COUNT with
 *  no verse rebuild. A lemma is a whole-word attribute, so this is a direct
 *  `words` count (no segment join needed, unlike root). */
export async function countLemmaConcordance(db: Client, lemmaBw: string): Promise<number> {
  const res = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM words WHERE lemma_buckwalter = ?',
    args: [lemmaBw],
  });
  return res.rows[0]!['n'] as number;
}

/** One page of a lemma's concordance (or all of it when `limit` is omitted).
 *  Mirrors getRootConcordancePage's shape and verse-rebuild, but filters
 *  directly on `words.lemma_buckwalter` -- no word_segments join, since lemma
 *  is a whole-word attribute. `form_id` is always null (no form chips for
 *  lemma pages). Deterministic surah->ayah->position order so LIMIT/OFFSET
 *  paging never repeats or skips an occurrence. */
export async function getLemmaConcordancePage(
  db: Client,
  lemmaBw: string,
  opts: LemmaConcordanceOpts = {},
): Promise<ConcordanceEntry[]> {
  const { limit, offset = 0, lang = 'en', batchSize = 500 } = opts;
  assertPagingBounds(limit, offset);
  // Positional binds must match SQL text order: LEFT JOIN's `lang` appears
  // before WHERE's `lemmaBw`, then LIMIT/OFFSET last.
  const args: (string | number)[] = [lang, lemmaBw];
  let paging = '';
  if (limit !== undefined) {
    paging = ' LIMIT ? OFFSET ?';
    args.push(limit, offset);
  }
  const matched = await db.execute({
    sql: `SELECT a.surah_id, a.ayah_number, w.position, w.id AS word_id,
                 w.ayah_id AS ayah_id, w.text_arabic, w.transliteration,
                 g.gloss_text AS gloss
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          LEFT JOIN word_glosses g ON g.word_id = w.id AND g.language_code = ?
          WHERE w.lemma_buckwalter = ?
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
    form_id: null,
    verse_words: wordsByAyah.get(r['ayah_id'] as number) ?? [],
  }));
}
