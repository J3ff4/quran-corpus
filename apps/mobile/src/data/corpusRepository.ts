import { selectedTranslators, type MobileDataClient } from '@quran-corpus/mobile-data';
import {
  compareRootsArabic,
  countLemmaConcordance,
  countRootConcordance,
  getAyahsBySurah,
  getAllSurahs,
  getGlossesWithFallback,
  getLemmaConcordancePage,
  getLemmaEntry,
  getLemmaFrequency,
  getRootConcordancePage,
  getRootEntry,
  getRootNeighbors,
  getRootSearchList,
  getRootsByFrequency,
  rootFirstLetter,
  getSegmentsByWordIds,
  getSurahById,
  getTranslationsBySurahAndLang,
  getVerbConcordance,
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

export async function getAyahReaderLocation(
  client: MobileDataClient,
  surahId: number,
  ayahNumber: number,
  languageCode: ContentLanguageCode,
): Promise<ReaderAyah | null> {
  const reader = await getSurahReader(client, surahId, languageCode);
  return reader.ayahs.find((item) => item.ayah.ayah_number === ayahNumber) ?? null;
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
export async function getSurahGlosses(
  client: MobileDataClient,
  surahId: number,
  languageCode: ContentLanguageCode,
): Promise<Map<number, string>> {
  const glosses = await getGlossesWithFallback(client, surahId, languageCode);
  return new Map(glosses.map((gloss) => [gloss.word_id, gloss.gloss_text]));
}

export interface WordSummary {
  word: Word;
  segments: WordSegment[];
  gloss: string | null;
}

/** Takes the whole `Word` rather than an id because every caller already holds
 *  one -- re-fetching it would be a query to recover something in hand. */
export async function getWordSummary(
  client: MobileDataClient,
  word: Word,
  gloss: string | null,
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

/** Roots filed under one hijāʾī letter, in dictionary order.
 *
 *  Filtered and sorted in JS, not in SQL, and deliberately so: rootFirstLetter
 *  folds hamza seats (أ إ آ ٱ to ا) and ى to ي, so a SQL prefix match would
 *  file those under four separate letters, and SQLite's binary collation would
 *  then order the bucket by codepoint -- every seated root ahead of every bare
 *  one. Web's DictionaryBrowser does both for the same reasons.
 *
 *  Nothing caches the list, so every letter tap re-reads all ~1.6k root rows
 *  (1642 in the shipped DB) and discards all but one bucket. That is a local
 *  SQLite file and one grouped query, so it is affordable; add a cache here if
 *  the grid ever feels slow. */
export async function getRootsForLetter(
  client: MobileDataClient,
  letter: string,
): Promise<RootSearchItem[]> {
  const roots = await getRootSearchList(client);
  return roots
    .filter((root) => rootFirstLetter(root.root_arabic) === letter)
    .sort((a, b) => compareRootsArabic(a.root_arabic, b.root_arabic));
}

/** Which hijāʾī buckets have any root at all. Folded with the same
 *  `rootFirstLetter` getRootsForLetter buckets with -- a second copy of the
 *  hamza-seat rules would enable a letter whose screen then comes up empty. */
export async function getLettersWithRoots(client: MobileDataClient): Promise<Set<string>> {
  const roots = await getRootSearchList(client);
  return new Set(roots.map((root) => rootFirstLetter(root.root_arabic)));
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

/** The Frequent pane's three lists flattened to one row shape, so the screen
 *  renders one list rather than three that differ only in field names. */
export async function getFrequencyRows(
  client: MobileDataClient,
  kind: 'roots' | 'lemmas' | 'verbs',
): Promise<FrequencyRow[]> {
  if (kind === 'roots') {
    const roots = await getRootsByFrequency(client);
    return roots.map((root) => ({
      href: `/root/${encodeURIComponent(root.root_buckwalter)}`,
      arabic: root.root_arabic,
      gloss: null,
      count: root.occurrence_count,
    }));
  }

  if (kind === 'lemmas') {
    const lemmas = await getLemmaFrequency(client);
    // Both queries filter `lemma_buckwalter IS NOT NULL`, so this drops nothing
    // today -- but the row type still allows null, and `?? ''` would build a
    // dead `/lemma/` link rather than omit an unroutable row.
    return lemmas
      .filter((row) => row.lemma_buckwalter !== null)
      .map((row) => ({
        href: `/lemma/${encodeURIComponent(row.lemma_buckwalter!)}`,
        arabic: row.lemma,
        gloss: null,
        count: row.count,
      }));
  }

  const verbs = await getVerbConcordance(client);
  return verbs
    .filter((row) => row.lemma_buckwalter !== null)
    .map((row) => ({
      // The lemma, not the surface form the row displays: form_arabic is the
      // commonest spelling of the verb and routing on it opens nothing.
      href: `/lemma/${encodeURIComponent(row.lemma_buckwalter!)}`,
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
