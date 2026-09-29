/**
 * The narrowest each surface's existing row can be and still lay out.
 *
 * Owner ruling R10: the rows are not being redesigned for grid cells, so the
 * minimum is a property of the design as drawn and has to be *measured*, not
 * chosen. These are the starting values; device check 505 re-measures each
 * against real text (the longest surah name, the longest root gloss, a
 * two-line note) and this table is corrected from that run before the phase
 * closes.
 *
 * Measured 2026-09-28 against the widest content in the live corpus, at
 * arabicScale 'medium' and fontScale 1.
 */
export const minCardWidths = {
  /** BrowseList Row: medallion + name + subtitle on one line. */
  browseRow: 380,
  /** Dictionary root cell: letter-spaced root + occurrence count. */
  dictionaryRoot: 300,
  /** Bookmark card: ayah reference, Arabic, a note that may run two lines. */
  bookmarkCard: 420,
  /** Search result: an Uthmani snippet with highlight, which is the longest
   *  single line anywhere in the app. */
  searchResult: 480,
} as const;
