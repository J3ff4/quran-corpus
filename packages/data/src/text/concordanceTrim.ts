import type { VerseWord } from '../types.js';

/** Max words to keep on a side when its natural clause runs long. */
const RADIUS = 6;
/** Min words to keep on a side when its natural clause is shorter than this
 *  (common in fast narrative passages where a clause boundary can land on
 *  the very next word). */
const MIN_HALF = 3;
/** Verses at or under this length are never trimmed -- windowing a verse
 *  this short saves no real space and risks cutting it for no reason. */
const SHORT_VERSE_MAX = 10;

export interface TrimmedVerse {
  words: VerseWord[];
  truncatedBefore: boolean;
  truncatedAfter: boolean;
}

/** Trim a concordance verse to a readable window centered on the matched word.
 *  `truncated*` flags tell the UI where to show a `…`. Unknown match id → the
 *  verse is returned whole (defensive; the matched word is always in verse_words). */
export function trimConcordanceVerse(words: VerseWord[], matchWordId: number): TrimmedVerse {
  const mi = words.findIndex((w) => w.id === matchWordId);
  if (mi === -1 || words.length <= SHORT_VERSE_MAX) {
    return { words, truncatedBefore: false, truncatedAfter: false };
  }

  const hasClauseInfo = words.some((w) => w.starts_clause);
  let lo: number;
  let hi: number;
  if (hasClauseInfo) {
    // clause = from the boundary at/left of the match to the next boundary right of it
    // (the match word itself counts: if it's a genuine clause-start, stop there).
    lo = mi;
    while (lo > 0 && !words[lo]!.starts_clause) lo -= 1;
    hi = mi + 1;
    while (hi < words.length && !words[hi]!.starts_clause) hi += 1;
    // Each side is capped/expanded independently: a long clause gets trimmed
    // to RADIUS, a short one gets padded out to MIN_HALF (bounded by the verse
    // edges). Independent so, e.g., a long left side doesn't force-expand an
    // already-correct short right side.
    const leftLen = mi - lo;
    const rightLen = hi - mi - 1;
    if (leftLen > RADIUS) lo = mi - RADIUS;
    else if (leftLen < MIN_HALF) lo = Math.max(0, mi - MIN_HALF);
    if (rightLen > RADIUS) hi = mi + RADIUS + 1;
    else if (rightLen < MIN_HALF) hi = Math.min(words.length, mi + MIN_HALF + 1);
  } else {
    lo = Math.max(0, mi - RADIUS);
    hi = Math.min(words.length, mi + RADIUS + 1);
  }
  return {
    words: words.slice(lo, hi),
    truncatedBefore: lo > 0,
    truncatedAfter: hi < words.length,
  };
}
