// Browser-safe entry point. Client components ('use client') MUST import data
// values from here, never from the root barrel (`@quran-corpus/data`): the
// barrel re-exports createDatabase → the node-only SQLite driver, which breaks
// hydration if it reaches the browser bundle. Everything re-exported
// here is pure (no DB, no node built-ins). Keep it that way — tests/client-entry
// guards the module graph.
export { EMPTY_SEARCH_RESULT } from './constants.js';
export {
  buckwalterToArabic,
  compareRootsArabic,
  rootFirstLetter,
  ARABIC_ALPHABET_ORDER,
} from './text/arabic.js';

// Types are erased at build time (no runtime import), but re-exporting the ones
// client components use lets them source both value and type from one path.
export type { SearchResult, RootSearchItem, ConcordanceEntry } from './types.js';
