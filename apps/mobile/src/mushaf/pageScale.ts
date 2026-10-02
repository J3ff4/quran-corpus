import { MUSHAF_PAGE_MAX, MUSHAF_PAGE_MIN } from '@quran-corpus/data/mobile';

import { MUSHAF_PAGE_LINE_EM, MUSHAF_PAGE_WIDEST_EM } from './pageMetrics.generated';

/**
 * The size past which Android starts dropping pieces of these whole-word
 * outlines (M7b's device run saw it at 44px). Not an active constraint on a
 * phone -- every page lands 18-28dp at 328dp of text width -- but a wider
 * column would walk into it silently, and a silently broken page looks like a
 * missing font rather than an oversized one.
 */
export const MUSHAF_MAX_FONT_SIZE = 40;

/**
 * What a page's side margins take off its width before the text block is fitted.
 *
 * Here rather than in MushafPage, even though that is the only component that
 * draws with it: a leaf has to size against the text block too, in order to give
 * both of its halves one type size, and it cannot import a component module the
 * pager's own tests mock. One place for the figure is what keeps a caller from
 * sizing against a wider box than the page draws into -- which hands down a size
 * the page then clamps away, invisibly, until two facing pages differ.
 */
export const MUSHAF_PAGE_TEXT_INSET = 32;

/**
 * What the page's furniture takes off its height before the 15 line slots are
 * measured.
 *
 * Here rather than in MushafPage for the same reason as the inset above: a leaf
 * has to fit the LINE BOX as well as the column in order to give both halves one
 * type size, and it cannot import a component module the pager's own tests mock.
 *
 * The furniture moved into the page's corners in M7d (rulings 8 and 9), and in
 * 2026-09 the top half of it moved again, off the leaf and onto MushafTopStrip.
 * What is left on the page is the number in a bottom corner.
 *
 * 72, not 44. The leaf used to sit flush against the bottom of the glass while a
 * strip of chrome ran across the top of it; the owner asked for the text block
 * up and the gap under it (2026-09-15). The surah and juz moving into
 * MushafTopStrip freed the 26dp header at the same time, so the block rises by
 * that and the space lands here.
 */
export const MUSHAF_PAGE_FOOTER_HEIGHT = 72;

/** A floor, so a mid-layout zero height cannot make a line invisible. */
const MIN_LINE_HEIGHT = 1;

/**
 * The slack a page keeps between its widest line and the column it sits in.
 *
 * `textWidth / em` is an exact fit by construction, and an exact fit is what
 * the device run found ellipsised: Android lays each glyph out at an integer
 * advance, so forty rounded-up glyphs put the widest line a few pixels past
 * the column and `numberOfLines={1}` answers with a '...'. Measured on page 46
 * at 640dpi the ink filled 1309 of 1312px -- there was nothing left to round
 * into. 1.5% is more than the worst rounding (~0.5px per glyph) and is half a
 * point of type at this size.
 */
const WIDTH_SLACK = 0.985;

function pageEm(table: readonly number[], page: number, what: string): number {
  if (!Number.isInteger(page) || page < MUSHAF_PAGE_MIN || page > MUSHAF_PAGE_MAX) {
    throw new RangeError(
      `mushaf page must be an integer ${MUSHAF_PAGE_MIN}..${MUSHAF_PAGE_MAX}, got ${page}`,
    );
  }
  const em = table[page - 1];
  if (em === undefined || em <= 0) {
    // The generated file is 604 entries by construction, so this is a stale
    // or truncated generation -- say which page, not "NaN".
    throw new Error(`no ${what} for mushaf page ${page}; run \`scraper mushaf-metrics\``);
  }
  return em;
}

const widestEm = (page: number) => pageEm(MUSHAF_PAGE_WIDEST_EM, page, 'width metrics');
/** The tallest line's ink on this page, top to bottom, in em. */
const tallestEm = (page: number) => pageEm(MUSHAF_PAGE_LINE_EM, page, 'height metrics');

/**
 * The largest type this page can set in a line box of `lineHeight` without
 * Android cutting the top off its glyphs.
 *
 * RN's Android text honours an explicit lineHeight by keeping the font's
 * descent and squeezing the ASCENT to fit, so everything the box cannot hold
 * comes off the TOP -- which on this script is the harakat. Measured on the
 * tablet in landscape (2026-10-02): every page set at the 40dp cap in a 49.9dp
 * line box, needing 1.84-2.09em, and showed a hard horizontal cut at the top of
 * every one of its 15 lines.
 *
 * The cap this imposes is real: 15 lines of ~1.9em is 28.5em of height, so a
 * short wide box fits far less type than its width would take. That is the
 * page's own proportion rather than a limit this code invents -- a leaf is
 * printed at one size, and in print the narrow page simply keeps more margin.
 */
export function mushafLineFitFontSize(page: number, lineHeight: number): number {
  return lineHeight / tallestEm(page);
}

export function mushafFontSize(page: number, textWidth: number): number {
  return Math.min((textWidth * WIDTH_SLACK) / widestEm(page), MUSHAF_MAX_FONT_SIZE);
}

/**
 * The widest column this page can actually fill, given the font cap.
 *
 * A clamped font cannot reach the edge of its column: these lines are
 * pre-justified in the source layout, so they have no way to stretch into the
 * slack. On a phone nothing clamps and this returns `available` untouched. On
 * the 1400dp tablet every one of the 604 pages clamps, and the median page
 * covers 47% of its column -- a small island of ragged text in a field of
 * background (S3 device run, 2026-09-27).
 *
 * Narrowing the column is the fix rather than raising the cap: above ~44px
 * Android starts dropping pieces of these whole-word outlines, which is the
 * defect MUSHAF_MAX_FONT_SIZE exists to prevent. A narrower centred column is
 * also the proportion the page has in print.
 */
export function mushafColumnWidth(page: number, available: number): number {
  return Math.min(available, (MUSHAF_MAX_FONT_SIZE * widestEm(page)) / WIDTH_SLACK);
}

/**
 * The type size this page lands on when `available` dp of width is offered to
 * its text block.
 *
 * The same number as `mushafFontSize(page, mushafColumnWidth(page, available))`,
 * which is how the page itself has always arrived at it -- stated directly
 * because a leaf has to know both of its pages' sizes BEFORE either one has a
 * column, and the column is what the size then follows from.
 */
export function mushafPageFontSize(page: number, available: number): number {
  return mushafFontSize(page, mushafColumnWidth(page, available));
}

/**
 * One type size for both halves of a leaf: the smaller of the two fits.
 *
 * Facing pages at different sizes read as a rendering bug. Each page's size
 * comes from its own widest line, and those differ -- the lines are
 * pre-justified in the source layout -- so two pages in identical halves would
 * otherwise draw at different sizes whenever one of them clamps and the other
 * does not. In print both pages of a leaf are set at one size and the narrower
 * page simply keeps more margin, which is what taking the smaller fit gives.
 */
export function mushafLeafFontSize(
  recto: number,
  verso: number | null,
  available: number,
  lineHeight: number,
): number {
  // Both fits, here rather than left to each page: a leaf that hands down a
  // width-only size has each half clamp its own height separately, and two
  // pages needing different line room come back at different sizes -- which is
  // the exact defect this function exists to prevent.
  const fit = (page: number) =>
    Math.min(mushafPageFontSize(page, available), mushafLineFitFontSize(page, lineHeight));
  return verso === null ? fit(recto) : Math.min(fit(recto), fit(verso));
}

/**
 * The column this page needs in order to draw at exactly `fontSize`.
 *
 * The inverse of `mushafFontSize`, for the case where the size was decided
 * somewhere above the page -- a leaf, where both halves share one. The page
 * still clamps it to the width it was given, so a column cannot run off its
 * half.
 */
export function mushafColumnForFontSize(page: number, fontSize: number): number {
  return (fontSize * widestEm(page)) / WIDTH_SLACK;
}

export function mushafLineHeight(textHeight: number, lineCount: number): number {
  if (lineCount <= 0) return MIN_LINE_HEIGHT;
  return Math.max(textHeight / lineCount, MIN_LINE_HEIGHT);
}
