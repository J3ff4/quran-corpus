import { selectedTranslators, type MobileDataClient } from '@quran-corpus/mobile-data';
import {
  countLemmaConcordance,
  countRootConcordance,
  getAyahPreviews,
  getAyahsBySurah,
  getAllSurahs,
  getGlossesWithFallback,
  getLemmaConcordancePage,
  getLemmaEntry,
  getLemmaFrequency,
  getLemmaFrequencyNeighbors,
  getRootConcordancePage,
  getRootEntry,
  getRootNeighbors,
  getRootSearchList,
  getRootsByFrequency,
  getSegmentsByWordIds,
  getSurahById,
  getTranslationsBySurahAndLang,
  getVerbConcordance,
  type LemmaFrequencyKind,
  getWordByLocation,
  getWordDetail,
  getWordsByAyah,
  getWordsBySurahAyahRange,
  search,
  type Ayah,
  type ConcordanceEntry,
  type LemmaEntry,
  type RootEntry,
  type RootSearchItem,
  type SearchResult,
  type Surah,
  type Translation,
  type Word,
  type WordDetail,
  type WordSegment,
} from '@quran-corpus/data/mobile';
import type { ContentLanguageCode } from '../i18n/languages';

const M0_SURAH_ID = 1;

// Fails the build if the shared list ever stops covering every content language
// the UI offers -- otherwise a new language would render a permanently blank
// translation pane instead of an error.
const translatorByLanguage: Record<ContentLanguageCode, string> = selectedTranslators;

export interface ReaderAyah {
  ayah: Ayah;
  translation: Translation | null;
}

export interface SurahReaderData {
  surah: Surah;
  ayahs: ReaderAyah[];
}

// Re-exported rather than wrapped: these already return the shape the screen
// renders, so a mapping layer here would be a rename and nothing else. The
// re-export keeps the mocking seam uniform -- every screen mocks
// @/data/corpusRepository, not @quran-corpus/data/mobile.
export { getJuzIndex, getPageIndex, getRevealedIndex } from '@quran-corpus/data/mobile';
export type { JuzEntry, PageEntry, RevealedEntry } from '@quran-corpus/data/mobile';

export interface SurahListItem {
  id: number;
  nameArabic: string;
  nameTranslit: string;
  nameTranslation: string;
  ayahCount: number;
}

function selectedTranslationByAyah(
  translations: Translation[],
  languageCode: ContentLanguageCode,
): Map<number, Translation> {
  const selectedTranslator = translatorByLanguage[languageCode];
  const grouped = new Map<number, Translation>();
  for (const translation of translations) {
    if (translation.translator === selectedTranslator) {
      grouped.set(translation.ayah_id, translation);
    }
  }

  // The guard above covers a language the DB does not carry at all (no rows).
  // This covers the other half: rows exist for the language but under a
  // different translator string, which filters every ayah out and renders a
  // blank translation pane with nothing to say why. Fail loudly instead --
  // the reader already has an error state, and a silent blank pane reads as a
  // corrupt download.
  if (translations.length > 0 && grouped.size === 0) {
    const present = [...new Set(translations.map((translation) => translation.translator))];
    throw new Error(
      `No ${languageCode} translation by ${selectedTranslator} in the bundled DB (found: ${present.join(', ')})`,
    );
  }

  return grouped;
}

export async function getSurahList(client: MobileDataClient): Promise<SurahListItem[]> {
  const surahs = await getAllSurahs(client);
  return surahs.map((surah) => ({
    id: surah.id,
    nameArabic: surah.name_arabic,
    nameTranslit: surah.name_translit,
    nameTranslation: surah.name_translation,
    ayahCount: surah.ayah_count,
  }));
}

export async function getSurahReader(
  client: MobileDataClient,
  surahId: number,
  languageCode: ContentLanguageCode,
): Promise<SurahReaderData> {
  // Words are deliberately not fetched here. Nothing in the reader renders
  // them, and pulling every word of a surah moved 6116 rows across the bridge
  // for al-Baqarah alone -- the heaviest thing the app did, for output no
  // screen read. Word-by-word display (M2 parity) needs one ayah's words on
  // demand, not the whole surah up front, so this is not a fetch to restore.
  const [surah, ayahs, translations] = await Promise.all([
    getSurahById(client, surahId),
    getAyahsBySurah(client, surahId),
    getTranslationsBySurahAndLang(client, surahId, languageCode),
  ]);

  if (!surah) throw new Error(`Surah not found: ${surahId}`);

  const translationsByAyah = selectedTranslationByAyah(translations, languageCode);

  return {
    surah,
    ayahs: ayahs.map((ayah) => ({
      ayah,
      translation: translationsByAyah.get(ayah.id) ?? null,
    })),
  };
}

/** One ayah plus the surah it sits in -- the home cards name the surah, the
 *  reader does not. */
export interface ReaderLocation extends ReaderAyah {
  surah: Surah;
}

/**
 * One ayah by its surah:ayah coordinate, in the reader's own shape.
 *
 * ponytail: reads the whole surah and picks one row out of it, because
 * getSurahReader already joins the surah, the ayah and the selected
 * translator's translation and nothing else here does. The ceiling is
 * al-Baqarah -- 286 ayahs and 286 translations across the bridge for one ayah.
 * If the home screen ever feels slow on launch, the upgrade is a
 * by-coordinate query in packages/data, not a second join here.
 */
export async function getAyahReaderLocation(
  client: MobileDataClient,
  surahId: number,
  ayahNumber: number,
  languageCode: ContentLanguageCode,
): Promise<ReaderLocation | null> {
  const reader = await getSurahReader(client, surahId, languageCode);
  const found = reader.ayahs.find((item) => item.ayah.ayah_number === ayahNumber);
  return found ? { surah: reader.surah, ...found } : null;
}

export async function getM0SurahReader(
  client: MobileDataClient,
  languageCode: ContentLanguageCode,
): Promise<SurahReaderData> {
  return getSurahReader(client, M0_SURAH_ID, languageCode);
}

export interface MobileWordDetail {
  detail: WordDetail | null;
  segments: WordSegment[];
}

export async function getWordsForAyah(client: MobileDataClient, ayahId: number): Promise<Word[]> {
  const words = await getWordsByAyah(client, ayahId);
  // Defence in depth, not a fix for a missing ORDER BY -- the shared query
  // already sorts. The reader aligns these to Uthmani tokens by array index,
  // so if that ordering ever changes the page still renders and every word
  // simply shows its neighbour's grammar, which nothing would surface.
  return [...words].sort((a, b) => a.position - b.position);
}

// getGlossesWithFallback takes a SURAH id, not a word-id list, so glosses are
// fetched once per surah and cached rather than queried per word tap. Its rows
// carry `gloss_text`, not `text`.
/**
 * One word's gloss, with the language it is actually written in.
 *
 * `word_glosses` carries `en` and `uz` rows and no `ru` at all, while `ru` is a
 * selectable content language -- so a reader on Russian gets the English gloss
 * for every word. getGlossesWithFallback tags each row with the language it
 * fell back to precisely so the UI can say so; dropping that tag rendered
 * English as if it were Russian, with nothing on screen admitting it (#12).
 *
 * `isFallback` is decided here rather than at each render site because this is
 * the one place that knows which language was asked for. The three surfaces
 * that print a gloss would otherwise each need the requested language threaded
 * down to them, and a fourth would silently forget to.
 */
export interface Gloss {
  text: string;
  lang: string;
  isFallback: boolean;
}

export async function getSurahGlosses(
  client: MobileDataClient,
  surahId: number,
  languageCode: ContentLanguageCode,
): Promise<Map<number, Gloss>> {
  const glosses = await getGlossesWithFallback(client, surahId, languageCode);
  return new Map(
    glosses.map((gloss) => [
      gloss.word_id,
      { text: gloss.gloss_text, lang: gloss.gloss_lang, isFallback: gloss.gloss_lang !== languageCode },
    ]),
  );
}

export interface WordSummary {
  word: Word;
  segments: WordSegment[];
  gloss: Gloss | null;
}

/** Takes the whole `Word` rather than an id because every caller already holds
 *  one -- re-fetching it would be a query to recover something in hand. */
export async function getWordSummary(
  client: MobileDataClient,
  word: Word,
  gloss: Gloss | null,
): Promise<WordSummary> {
  const segments = await getSegmentsByWordIds(client, [word.id]);
  return {
    word,
    // The sheet renders pills in array order, so a prefix sorted after its
    // stem misdescribes the word's structure.
    segments: [...segments].sort((a, b) => a.segment_index - b.segment_index),
    // A missing gloss is normal, not an error: it must not suppress the
    // morphology, which is the part that always exists.
    gloss,
  };
}

export async function getWordAtLocation(
  client: MobileDataClient,
  surahId: number,
  ayahNumber: number,
  position: number,
  languageCode: ContentLanguageCode,
): Promise<WordSummary | null> {
  const word = await getWordByLocation(client, surahId, ayahNumber, position);
  if (!word) return null;
  const glosses = await getSurahGlosses(client, surahId, languageCode);
  return getWordSummary(client, word, glosses.get(word.id) ?? null);
}

export interface WbwPage {
  ayahNumber: number;
  words: Word[];
  segments: Map<number, WordSegment[]>;
}

export async function getWbwRange(
  client: MobileDataClient,
  surahId: number,
  fromAyah: number,
  toAyah: number,
): Promise<WbwPage[]> {
  const words = await getWordsBySurahAyahRange(client, surahId, fromAyah, toAyah);
  if (words.length === 0) return [];

  // One query for the whole page's segments, fanned back out by word_id. Per
  // word it would be one round trip per cell -- ~150 for a ten-ayah page.
  const allSegments = await getSegmentsByWordIds(
    client,
    words.map((word) => word.id),
  );
  const byWord = new Map<number, WordSegment[]>();
  for (const segment of allSegments) {
    const list = byWord.get(segment.word_id);
    if (list) list.push(segment);
    else byWord.set(segment.word_id, [segment]);
  }
  for (const list of byWord.values()) list.sort((a, b) => a.segment_index - b.segment_index);

  // `Word` carries ayah_id, NOT ayah_number -- getWordsBySurahAyahRange orders
  // by a.ayah_number but selects w.*, so the number never reaches the rows.
  // Resolve it through the surah's ayahs.
  const ayahs = await getAyahsBySurah(client, surahId);
  const numberByAyahId = new Map(ayahs.map((ayah) => [ayah.id, ayah.ayah_number]));

  const byAyah = new Map<number, Word[]>();
  for (const word of words) {
    const ayahNumber = numberByAyahId.get(word.ayah_id);
    if (ayahNumber === undefined) continue;
    const list = byAyah.get(ayahNumber);
    if (list) list.push(word);
    else byAyah.set(ayahNumber, [word]);
  }

  return [...byAyah.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ayahNumber, ayahWords]) => {
      const pageWords = [...ayahWords].sort((a, b) => a.position - b.position);
      return {
        ayahNumber,
        words: pageWords,
        // This ayah's segments only. Handing every page the whole range's map
        // is correct by lookup -- word_id is unique across the corpus -- but
        // it makes `page.segments` a lie: anything that iterates it instead of
        // getting by id reads the neighbouring ayahs' grammar too, and there
        // is nothing on screen to say so.
        segments: new Map(pageWords.map((word) => [word.id, byWord.get(word.id) ?? []])),
      };
    });
}

/** Ayahs per word-by-word page. Al-Baqarah's densest ten run to roughly 400
 *  words; the whole-surah load this replaces was 6,116 (see getSurahReader). */
export const WBW_PAGE_SIZE = 10;

/** The range a page starting at `from` covers, clamped to the surah's length.
 *
 *  Not aligned to multiples of ten: every entry point carries the ayah the
 *  reader means (a bookmark at 2:255 opens a page at 255, not at 251). */
export function wbwPageRange(from: number, ayahCount: number): [number, number] {
  const start = Math.max(1, Math.min(from, ayahCount));
  return [start, Math.min(ayahCount, start + WBW_PAGE_SIZE - 1)];
}

export interface WbwScreenData {
  surah: Surah;
  /** The range actually served, clamped -- `from` may arrive from a deep link
   *  naming an ayah past the end of this surah. */
  from: number;
  to: number;
  pages: WbwPage[];
}

/** The word-by-word screen's whole payload: the surah row (for its name and
 *  `ayah_count`, which bounds the pager) plus one page per ayah in range. */
export async function getWbwScreen(
  client: MobileDataClient,
  surahId: number,
  fromAyah: number,
): Promise<WbwScreenData> {
  // Sequential, not Promise.all: the range query is only well-formed once
  // ayah_count has clamped it. Parallel saves one round trip on a local file
  // and costs an empty screen for every ayah past the end of a short surah.
  const surah = await getSurahById(client, surahId);
  if (!surah) throw new Error(`Surah not found: ${surahId}`);
  const [from, to] = wbwPageRange(fromAyah, surah.ayah_count);
  return { surah, from, to, pages: await getWbwRange(client, surahId, from, to) };
}

export async function getRootScreen(
  client: MobileDataClient,
  rootBuckwalter: string,
): Promise<RootEntry | null> {
  return getRootEntry(client, rootBuckwalter);
}

/** Hijāʾī-adjacent roots for the root screen's Previous/Next.
 *
 *  Indexed O(1) on roots.sort_order, which the bundled DB ships populated
 *  (1642 rows, 0 NULL, verified 2026-08-21). If a future rebuild ships it NULL
 *  the shared query degrades to a full compareRootsArabic sort -- slower, still
 *  correct -- so this needs no fallback of its own. */
export async function getAdjacentRoots(
  client: MobileDataClient,
  bw: string,
): Promise<{ prev: string | null; next: string | null }> {
  return getRootNeighbors(client, bw);
}

/** The lemmas either side of this one in the ranking the reader entered from.
 *
 *  Frequency rank, not alphabetical, because that is the only order a lemma
 *  screen is ever reached in -- the Most-used lists. `lemmas` and `verbs` are
 *  different rankings over overlapping sets (a verb lemma sits at a different
 *  rank in each), which is why the ranking travels in the route rather than
 *  being guessed here. */
export async function getAdjacentLemmas(
  client: MobileDataClient,
  lemmaBuckwalter: string,
  kind: LemmaFrequencyKind,
): Promise<{ prev: string | null; next: string | null }> {
  return getLemmaFrequencyNeighbors(client, lemmaBuckwalter, kind);
}

/** Every root, unfiltered and unsorted beyond `getRootSearchList`'s own
 *  `ORDER BY root_arabic`. Browse does its own filter (search text, active
 *  letter) and sort (alpha/freq) over this in JS -- see DictionaryScreen --
 *  the same split web's DictionaryBrowser uses over its own static payload. */
export async function getAllRootsForBrowse(client: MobileDataClient): Promise<RootSearchItem[]> {
  return getRootSearchList(client);
}

/** One row of the Frequent pane, whichever of the three lists produced it. */
export interface FrequencyRow {
  /** Route target: a root screen for roots, a lemma screen for the other two. */
  href: string;
  arabic: string;
  gloss: string | null;
  count: number;
}

export async function getRootOccurrenceCount(
  client: MobileDataClient,
  bw: string,
  formIds?: number[],
): Promise<number> {
  return countRootConcordance(client, bw, formIds);
}

export async function getRootOccurrences(
  client: MobileDataClient,
  bw: string,
  lang: ContentLanguageCode,
  offset: number,
  limit: number,
  formIds?: number[],
): Promise<ConcordanceEntry[]> {
  // Not `{ ..., formIds }`: apps/mobile's tsconfig sets
  // exactOptionalPropertyTypes, which rejects an explicit `undefined` against
  // ConcordancePageOpts's optional `formIds?: number[]` -- the key has to be
  // absent, not present-with-undefined.
  return getRootConcordancePage(client, bw, { lang, offset, limit, ...(formIds && { formIds }) });
}

export async function getLemmaScreen(
  client: MobileDataClient,
  lemmaBw: string,
  lang: ContentLanguageCode,
): Promise<{ entry: LemmaEntry | null; total: number }> {
  const [entry, total] = await Promise.all([
    getLemmaEntry(client, lemmaBw, lang),
    countLemmaConcordance(client, lemmaBw),
  ]);
  return { entry, total };
}

export async function getLemmaOccurrences(
  client: MobileDataClient,
  lemmaBw: string,
  lang: ContentLanguageCode,
  offset: number,
  limit: number,
): Promise<ConcordanceEntry[]> {
  return getLemmaConcordancePage(client, lemmaBw, { lang, offset, limit });
}

/** Rows per Frequent list. The shared queries default to 200, which is a page
 *  and a half of scrolling -- short enough that a reader hits the bottom and
 *  reads it as the end of the data. 1000 rows of three columns is ~40KB across
 *  the bridge from a local file, once per chip tap. */
export const FREQUENCY_LIMIT = 1000;

/** The Frequent pane's three lists flattened to one row shape, so the screen
 *  renders one list rather than three that differ only in field names. */
export async function getFrequencyRows(
  client: MobileDataClient,
  kind: 'roots' | 'lemmas' | 'verbs',
  limit = FREQUENCY_LIMIT,
): Promise<FrequencyRow[]> {
  if (kind === 'roots') {
    const roots = await getRootsByFrequency(client, limit);
    return roots.map((root) => ({
      href: `/root/${encodeURIComponent(root.root_buckwalter)}`,
      arabic: root.root_arabic,
      gloss: null,
      count: root.occurrence_count,
    }));
  }

  if (kind === 'lemmas') {
    const lemmas = await getLemmaFrequency(client, limit);
    // Both queries filter `lemma_buckwalter IS NOT NULL`, so this drops nothing
    // today -- but the row type still allows null, and `?? ''` would build a
    // dead `/lemma/` link rather than omit an unroutable row.
    return lemmas
      .filter((row) => row.lemma_buckwalter !== null)
      .map((row) => ({
        // The ranking travels with the row: the lemma screen's Previous/Next
        // walks whichever list the reader opened it from.
        href: `/lemma/${encodeURIComponent(row.lemma_buckwalter!)}?from=lemmas`,
        arabic: row.lemma,
        gloss: null,
        count: row.count,
      }));
  }

  const verbs = await getVerbConcordance(client, limit);
  return verbs
    .filter((row) => row.lemma_buckwalter !== null)
    .map((row) => ({
      // The lemma, not the surface form the row displays: form_arabic is the
      // commonest spelling of the verb and routing on it opens nothing.
      href: `/lemma/${encodeURIComponent(row.lemma_buckwalter!)}?from=verbs`,
      arabic: row.form_arabic,
      gloss: row.lemma,
      count: row.count,
    }));
}

export async function getM0WordDetail(
  client: MobileDataClient,
  wordId: number,
): Promise<MobileWordDetail> {
  const detail = await getWordDetail(client, wordId);
  const segments = detail ? await getSegmentsByWordIds(client, [detail.word.id]) : [];
  return { detail, segments };
}

/** Search restricted to what the reader actually shows: Arabic plus the one
 *  translator this language is bound to. Without the translator the DB's four
 *  Russian translations each return the same verse. */
export async function searchCorpus(
  client: MobileDataClient,
  query: string,
  languageCode: ContentLanguageCode,
): Promise<SearchResult> {
  return search(client, query, {
    language: languageCode,
    translator: translatorByLanguage[languageCode],
  });
}

/** The ayah text behind a list of bookmarks, keyed `surah:ayah`.
 *
 *  One query for the whole list. The per-surah readers cannot answer this
 *  without loading every surah involved, which on a phone is the difference
 *  between a list that appears and one that arrives a surah at a time. A
 *  coordinate whose row is missing is simply absent from the map, so the row
 *  renders its coordinate and no text rather than failing.
 */
export async function getBookmarkAyahTexts(
  client: MobileDataClient,
  coordinates: readonly { surahId: number; ayahNumber: number }[],
): Promise<Map<string, string>> {
  if (coordinates.length === 0) return new Map();
  const previews = await getAyahPreviews(client, coordinates);
  return new Map(previews.map((p) => [`${p.surah_id}:${p.ayah_number}`, p.text_uthmani]));
}
