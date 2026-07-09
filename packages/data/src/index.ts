export { createDatabase } from './db.js';
export { runMigrations } from './migrate.js';
export { getAllSurahs, getSurahById } from './queries/surahs.js';
export { getAyahsBySurah, getAyahWithWords } from './queries/ayahs.js';
export {
  getWordsByAyah,
  getWordsBySurah,
  getWordsBySurahAyahRange,
  getWordByLocation,
  getWordDetail,
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
} from './queries/roots.js';
export { buckwalterToArabic, compareRootsArabic, rootFirstLetter, ARABIC_ALPHABET_ORDER } from './text/arabic.js';
export { trimConcordanceVerse } from './text/concordanceTrim.js';
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
  VerseRef,
  VerseHit,
  JumpVerse,
  SearchResult,
} from './types.js';
export type { Client } from './db.js';
