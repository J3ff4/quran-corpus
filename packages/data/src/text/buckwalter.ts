// Buckwalter transliteration validator for root/lemma identifiers that arrive
// as untrusted URL path segments. SQL is fully parameterized everywhere these
// values are used, so this is not the injection defense -- it is an early
// reject of junk paths (and the single source of truth for "what is a valid
// identifier", so the API routes and the page routes never disagree about it;
// an SSR-accepts / CSR-rejects split is exactly the bug this centralizes away).
//
// Charset derived empirically from the live corpus, not guessed: every distinct
// character across all 4832 non-null `words.lemma_buckwalter` values plus all
// `roots.root_buckwalter` values. Beyond the ASCII letters and the classic
// hamza/madda/wasla symbols, real corpus tokens also carry `# , . @ [ ^ _ +`
// and the digit `2` (e.g. `samaA^'`, `jaA^'a`). A regex missing any of these
// silently 400s a common word's concordance paging -- observed on 280 lemmas,
// 14 of them in the linked top-200 frequency list.
//
// Longest observed lemma token is 15 chars; roots are shorter. Callers pass the
// cap for their identifier kind so the two stay distinct without duplicating the
// (identical) charset.
const BUCKWALTER_CHAR_CLASS = "A-Za-z0-9'`+><{}|&*$~#,.@[\\]^_";

// Compiled once at module load, not per call -- validation runs on every
// /api/lemma, /api/roots request and every lemma page SSR.
const BUCKWALTER_RE = new RegExp(`^[${BUCKWALTER_CHAR_CLASS}]+$`);

// Length caps are a junk-path guard, not a precise corpus fact, so they carry
// generous headroom: the longest observed lemma_buckwalter is 15 and roots are
// shorter, but a future re-import must not silently 400 a longer token (the
// frequency table links to whatever the DB holds). Anything over these is
// implausibly long for a Buckwalter identifier and still rejected.
/** Generous cap for a lemma_buckwalter path segment (longest observed: 15). */
export const LEMMA_BUCKWALTER_MAX = 32;
/** Generous cap for a root_buckwalter path segment (roots are short). */
export const ROOT_BUCKWALTER_MAX = 24;

/**
 * True if `s` is a plausible Buckwalter identifier of at most `maxLen` chars.
 * Rejects empty strings, whitespace, and anything outside the corpus charset.
 */
export function isBuckwalter(s: string, maxLen: number): boolean {
  if (s.length === 0 || s.length > maxLen) return false;
  return BUCKWALTER_RE.test(s);
}

/** Convenience: validate a lemma_buckwalter path segment. */
export function isLemmaBuckwalter(s: string): boolean {
  return isBuckwalter(s, LEMMA_BUCKWALTER_MAX);
}

/** Convenience: validate a root_buckwalter path segment. */
export function isRootBuckwalter(s: string): boolean {
  return isBuckwalter(s, ROOT_BUCKWALTER_MAX);
}
