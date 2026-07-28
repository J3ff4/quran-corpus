import type { SearchResult } from './types.js';

// Canonical empty result — returned for blank queries and used by UI surfaces
// as the initial/reset state. Frozen (incl. nested arrays) so a consumer that
// mutates it (e.g. result.verses.push) can't corrupt the shared reference.
//
// Kept in this DB-free module (not queries/search.ts) so client components can
// import it via `@quran-corpus/data/client` without pulling the libsql driver
// into the browser bundle.
export const EMPTY_SEARCH_RESULT: SearchResult = Object.freeze({
  jump: null,
  verses: Object.freeze([]) as unknown as SearchResult['verses'],
  roots: Object.freeze([]) as unknown as SearchResult['roots'],
}) as SearchResult;
