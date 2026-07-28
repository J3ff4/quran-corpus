import type { VerseWord } from '../types.js';

/** Min words to keep on a side when its natural clause is shorter than this
 *  (common in fast narrative passages where a clause boundary can land on
 *  the very next word). */
const MIN_HALF = 3;
/** Verses at or under this length are never trimmed -- windowing a verse
 *  this short saves no real space and risks cutting it for no reason. */
const SHORT_VERSE_MAX = 10;
/** Hard ceiling on the total trimmed window (both sides + match word).
 *  A long clause is capped by shrinking whichever side is currently longer,
 *  never below MIN_HALF -- so the cap is on the combined read, not per side. */
const MAX_WINDOW = 11;

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
    // A short natural clause gets padded out to MIN_HALF (bounded by the verse
    // edges); a long one is left alone here and squeezed below instead, so the
    // cap applies to the combined window rather than each side independently.
    let leftLen = mi - lo;
    let rightLen = hi - mi - 1;
    if (leftLen < MIN_HALF) leftLen = Math.min(mi, MIN_HALF);
    if (rightLen < MIN_HALF) rightLen = Math.min(words.length - mi - 1, MIN_HALF);

    while (leftLen + rightLen + 1 > MAX_WINDOW && (leftLen > MIN_HALF || rightLen > MIN_HALF)) {
      if (leftLen >= rightLen && leftLen > MIN_HALF) leftLen -= 1;
      else if (rightLen > MIN_HALF) rightLen -= 1;
      else leftLen -= 1;
    }

    lo = mi - leftLen;
    hi = mi + rightLen + 1;
  } else {
    const half = Math.floor((MAX_WINDOW - 1) / 2);
    lo = Math.max(0, mi - half);
    hi = Math.min(words.length, mi + half + 1);
  }
  return {
    words: words.slice(lo, hi),
    truncatedBefore: lo > 0,
    truncatedAfter: hi < words.length,
  };
}
