/**
 * Which ayah a mushaf page starts at, and whether the playhead is still on it.
 *
 * Pure and page-shaped on purpose: the mushaf INDEX cannot answer either
 * question. `PageEntry.startAyahNumber` is the ayah a page *opens in*, which is
 * usually a tail carried over from the page before, and `pageForAyah` is
 * vacuous as a check for a page's own opener -- page P opens exactly at (s,a),
 * so it always answers P. Long ayahs span pages, so no index-only rule exists.
 * The composed page is the only thing that knows.
 */

/** Structural, not `MushafWord`: this module needs three fields and no glyphs,
 *  so the tests can state a page in three lines instead of twenty. */
export interface PageWord {
  surahId: number;
  ayahNumber: number;
  position: number;
}

export interface PageLine {
  words: PageWord[];
}

export interface AyahRef {
  surahId: number;
  ayahNumber: number;
}

/**
 * The first ayah that BEGINS on this page, or null on a page that begins none.
 *
 * `position === 1` is the whole rule. Not the page's opening word, which is a
 * carried-over tail on most pages; not the page's `startSurahId`, since 17
 * surahs are never any page's opener (81, 85, 91, 93, 95, 97, 99, 101, 102,
 * 104, 105, 107, 108, 110, 111, 113, 114) and a rule keyed on it misses every
 * one of them.
 *
 * Null is real: 2:282 alone fills more than a page, so a page can be one
 * unbroken middle with nothing to start at.
 */
export function firstAyahOnPage(lines: readonly PageLine[]): AyahRef | null {
  for (const line of lines) {
    for (const word of line.words) {
      if (word.position === 1) return { surahId: word.surahId, ayahNumber: word.ayahNumber };
    }
  }
  return null;
}

/** Is `playhead` printed anywhere on this page? Drives the auto page-turn and
 *  the compact bar's resume. */
export function ayahOnPage(lines: readonly PageLine[], playhead: AyahRef): boolean {
  return lines.some((line) =>
    line.words.some(
      (word) =>
        word.surahId === playhead.surahId && word.ayahNumber === playhead.ayahNumber,
    ),
  );
}
