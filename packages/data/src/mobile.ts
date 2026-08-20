// React Native entry point. `apps/mobile` MUST import from here, never from the
// root barrel (`@quran-corpus/data`): the barrel re-exports createDatabase and
// runMigrations, which pull @libsql/client — a node-native driver — into the
// Metro module graph, where it cannot resolve. Mobile opens its own database
// through expo-sqlite (see packages/mobile-data) and needs reads only, so this
// entry point exposes query functions and types and nothing that writes,
// migrates, or backfills. tests/mobile-entry guards the module graph; the
// parallel guard for the browser is tests/client-entry (see client.ts).
//
// Unlike ./client this cannot be `export type *` plus a handful of pure
// helpers: mobile runs real queries against a real DB, so the list below is a
// hand-maintained subset that overlaps the barrel. Widening it is fine as long
// as nothing added reaches db.ts, migrate.ts, or a backfill.
export { ayahAudioUrl, AYAH_AUDIO_ATTRIBUTION, AYAH_AUDIO_ORIGIN, AYAH_AUDIO_RECITER } from './audio.js';
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
export { getTranslationsByAyah, getTranslation, getTranslationsBySurahAndLang } from './queries/translations.js';
export { getGlossesBySurahAndLang, getGlossesWithFallback } from './queries/glosses.js';
export type { GlossWithLang } from './queries/glosses.js';
export { parseVerseRef, searchVerses, search, EMPTY_SEARCH_RESULT } from './queries/search.js';
export type { VerseSearchOpts } from './queries/search.js';
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
} from './queries/roots.js';
export {
  getLemmaEntry,
  getLemmaConcordancePage,
  countLemmaConcordance,
} from './queries/lemma.js';
export { getLemmaFrequency, getVerbConcordance } from './queries/dictionary.js';
export { buckwalterToArabic, compareRootsArabic, rootFirstLetter, ARABIC_ALPHABET_ORDER } from './text/arabic.js';
// The root and lemma routes take a Buckwalter identifier straight off a deep
// link, so they need the same charset and length caps the web routes use.
// buckwalter.ts has no runtime imports, so this adds no edge to the Metro graph.
//
// The charset predicates, NOT `parseRootParam`/`parseLemmaParam`: those decode
// first, and expo-router has already decoded every param by the time a route
// sees it, so a second decode would accept `qa%2541la` as `qaAla`. Mobile wraps
// these in apps/mobile/src/data/routeParams.ts, the same way web's route
// handlers (which also receive a decoded segment) call them directly.
export { isRootBuckwalter, isLemmaBuckwalter, ROOT_BUCKWALTER_MAX } from './text/buckwalter.js';
export { trimConcordanceVerse } from './text/concordanceTrim.js';
export { definitionSourceLabel } from './definitionSources.js';
export { isSajdahAyah } from './text/sajdah.js';
export { alignAyahTokens, splitBasmala, type AyahToken } from './text/ayahTokens.js';
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
  LemmaEntry,
  LemmaSense,
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

// The client contract mobile satisfies with its expo-sqlite adapter. Exported
// here so apps/mobile can type its repository seam without a cast.
export type { QueryClient, QueryRow, QueryArg } from './queryClient.js';
