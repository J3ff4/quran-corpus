export { createDatabase } from './db.js';
export { runMigrations, normalizeLemmaMadda } from './migrate.js';
export { getAllSurahs, getSurahById } from './queries/surahs.js';
export { getAyahsBySurah, getAyahWithWords } from './queries/ayahs.js';
export {
  getWordsByAyah,
  getWordsBySurah,
  getWordsBySurahAyahRange,
  getWordByLocation,
  getWordDetail,
  getSegmentsByWordIds,
} from './queries/words.js';
export { getLemmaFrequency, getVerbConcordance } from './queries/dictionary.js';
export { getTranslationsByAyah, getTranslation, getTranslationsBySurahAndLang } from './queries/translations.js';
export { getGlossesBySurahAndLang, getGlossesWithFallback } from './queries/glosses.js';
export type { GlossWithLang } from './queries/glosses.js';
export {
  backfillSearchIndex,
  parseVerseRef,
  searchVerses,
  search,
  EMPTY_SEARCH_RESULT,
} from './queries/search.js';
export {
  getRootByBuckwalter,
  getAllRoots,
  getRootArabicList,
  getRootsByFrequency,
  searchRoots,
  getRootForms,
  getRootDefinitions,
  getRootEntry,
  getRootConcordance,
  getRootConcordancePage,
  countRootConcordance,
  getRootSearchList,
  getRootNeighbors,
  backfillRootSortOrder,
  backfillRootSortOrderIfStale,
} from './queries/roots.js';
export type { ConcordancePageOpts } from './queries/roots.js';
export { getLemmaEntry, getLemmaConcordancePage, countLemmaConcordance } from './queries/lemma.js';
// LEMMA_GLOSS_LIMIT, cleanGloss and cleanGlossList are deliberately NOT
// exported: getLemmaEntry already applies them, so nothing outside this package
// has a use for them, and the tests import the source module directly. Public
// surface with no caller is surface that has to keep working forever.
export {
  CONCORDANCE_PAGE_SIZE,
  CONCORDANCE_MAX_LIMIT,
  parseConcordancePaging,
  assertPagingBounds,
} from './queries/concordance.js';
export { definitionSourceLabel } from './definitionSources.js';
export { buckwalterToArabic, compareRootsArabic, rootFirstLetter, ARABIC_ALPHABET_ORDER } from './text/arabic.js';
export {
  isBuckwalter,
  isLemmaBuckwalter,
  isRootBuckwalter,
  parseLemmaParam,
  parseRootParam,
  LEMMA_BUCKWALTER_MAX,
  ROOT_BUCKWALTER_MAX,
} from './text/buckwalter.js';
export { trimConcordanceVerse } from './text/concordanceTrim.js';
export { isSajdahAyah } from './text/sajdah.js';
export { alignAyahTokens, type AyahToken } from './text/ayahTokens.js';
export { posBucket, type PosBucket } from './morphology/buckets.js';
export { decodeSegment, posLabelEn } from './morphology/decode.js';
export type {
  Surah,
  Ayah,
  Word,
  Language,
  Translation,
  WordGloss,
  Root,
  RootSearchItem,
  RootForm,
  RootDefinition,
  RootEntry,
  ConcordanceEntry,
  VerseWord,
  WordSegment,
  ConceptTag,
  WordDetail,
  DecodedSegment,
  DecodedFeature,
  LemmaFrequencyEntry,
  VerbConcordanceEntry,
  LemmaEntry,
  LemmaSense,
  VerseRef,
  VerseHit,
  JumpVerse,
  SearchResult,
} from './types.js';
export type { Client } from './db.js';
export type { QueryClient, QueryRow, QueryArg } from './queryClient.js';
