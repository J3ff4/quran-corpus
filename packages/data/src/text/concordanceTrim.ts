import type { VerseWord } from '../types.js';

/** Words to keep on each side of the matched word in a trimmed concordance verse. */
const RADIUS = 4;

export interface TrimmedVerse {
  words: VerseWord[];
  truncatedBefore: boolean;
  truncatedAfter: boolean;
}

/** Trim a concordance verse to a readable window centered on the matched word.
 *  Baseline: ±RADIUS words (≤ 2*RADIUS+1). The matched word is always present;
 *  `truncated*` flags tell the UI where to show a `…`. Unknown match id → the
 *  verse is returned whole (defensive; the matched word is always in verse_words). */
export function trimConcordanceVerse(words: VerseWord[], matchWordId: number): TrimmedVerse {
  const mi = words.findIndex((w) => w.id === matchWordId);
  if (mi === -1) return { words, truncatedBefore: false, truncatedAfter: false };

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
    // cap an over-long clause to ±RADIUS around the match
    lo = Math.max(lo, mi - RADIUS);
    hi = Math.min(hi, mi + RADIUS + 1);
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
