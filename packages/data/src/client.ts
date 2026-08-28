// Browser-safe entry point. Client components ('use client') MUST import data
// values from here, never from the root barrel (`@quran-corpus/data`): the
// barrel re-exports createDatabase → the node-only SQLite driver, which breaks
// hydration if it reaches the browser bundle. Everything re-exported
// here is pure (no DB, no node built-ins). Keep it that way — tests/client-entry
// guards the module graph.
export { EMPTY_SEARCH_RESULT } from './constants.js';
export {
  ayahAudioUrl,
  reciterById,
  AYAH_AUDIO_ORIGIN,
  DEFAULT_RECITER_ID,
  RECITERS,
  type Reciter,
} from './audio.js';
export { CONCORDANCE_PAGE_SIZE } from './queries/concordance.js';
export { definitionSourceLabel } from './definitionSources.js';
export {
  buckwalterToArabic,
  compareRootsArabic,
  foldRootArabic,
  rootFirstLetter,
  ARABIC_ALPHABET_ORDER,
} from './text/arabic.js';
export {
  MEANING_MIN_CHARS,
  matchesRootQuery,
  type RootSearchKeys,
} from './text/rootSearch.js';
export { trimConcordanceVerse } from './text/concordanceTrim.js';
export type { TrimmedVerse } from './text/concordanceTrim.js';
export { isSajdahAyah } from './text/sajdah.js';
export { alignAyahTokens, splitBasmala, type AyahToken } from './text/ayahTokens.js';
export { posBucket, type PosBucket } from './morphology/buckets.js';
export { decodeSegment, posLabelEn } from './morphology/decode.js';
export { categorizeFormLabel, type FormCategory } from './morphology/formCategory.js';

// All of them, not a curated subset. `types.ts` is a pure declaration file with
// no imports of its own, and `export type *` emits no runtime import at all — so
// unlike the values above, widening this cannot pull anything into the bundle.
// Curating it only meant a client component needing one more type had to reach
// for the barrel instead, which is the exact mistake this entry point exists to
// prevent.
export type * from './types.js';
