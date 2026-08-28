// The dictionary's one search box drives three arms — root spelling, Buckwalter
// transliteration, and meaning — and both apps filter the same in-memory
// payload with them. They are shared here rather than written twice because the
// two copies had already grown a pair of comments each promising to stay in
// step with `searchRoots`, which is how a rule gets three implementations and
// two of them drift.

/** Shortest query the meaning arm will answer.
 *
 *  `gloss_blob` is dictionary prose — Hans Wehr's concise glosses plus Lane's
 *  full classical entries, up to 1479 characters for one root — matched as a
 *  plain substring, so a short needle is inside nearly every root: `he` hits
 *  1019 of the corpus's 1642 blobs (62%).
 *
 *  Three is where the words a reader actually searches for become selective —
 *  `sun` 2.9%, `eye` 2.1%, `camel` 2.7% — not where the noise stops. English
 *  function-word fragments stay useless at this length (`ing` 53%, `the` 46%,
 *  `and` 34%), but those only ever appear in passing while a longer word is
 *  being typed, and raising the floor to four would cost the short content
 *  words permanently. The real fix for the fragments is word-boundary matching
 *  or FTS, which is a change to how the arm matches, not to how long it waits;
 *  a length gate cannot make `the` mean "theft".
 *
 *  The root and Buckwalter arms have no such problem — they match short
 *  strings against short strings, `qw` finds قول — so they keep matching from
 *  the first character and only the meaning arm waits. */
export const MEANING_MIN_CHARS = 3;

/** One root's three search keys, pre-lowercased and pre-folded.
 *
 *  Taken pre-computed rather than derived here because the mobile list folds
 *  all 1642 roots once when the payload lands: `foldRootArabic` walks a string
 *  a code point at a time, and doing that per keystroke is the difference
 *  between a chip that lights under the thumb and one that lights a beat
 *  later. */
export interface RootSearchKeys {
  /** `foldRootArabic(root_arabic)` — hamza seats levelled, spaces dropped. */
  folded: string;
  /** `root_buckwalter`, lowercased. */
  bw: string;
  /** `gloss_blob`, lowercased; `''` when the root carries no definitions. */
  gloss: string;
}

/** Whether one root answers the query.
 *
 *  `query` is the trimmed, lowercased needle and `foldedQuery` is
 *  `foldRootArabic(query)` — both from the caller so a list filter folds the
 *  needle once instead of once per row. The Latin arms deliberately use the
 *  raw needle: `foldRootArabic('ktb') === 'ktb'`, and a folded Latin needle
 *  never occurs inside an Arabic haystack, so the two cannot cross. */
export function matchesRootQuery(
  keys: RootSearchKeys,
  query: string,
  foldedQuery: string,
): boolean {
  return (
    keys.folded.includes(foldedQuery) ||
    keys.bw.includes(query) ||
    (query.length >= MEANING_MIN_CHARS && keys.gloss.includes(query))
  );
}
