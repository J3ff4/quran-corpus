import { MUSHAF_PAGE_MAX, MUSHAF_PAGE_MIN } from '@quran-corpus/data/mobile';

import { MUSHAF_PAGE_WIDEST_EM } from './pageMetrics.generated';

/**
 * The size past which Android starts dropping pieces of these whole-word
 * outlines (M7b's device run saw it at 44px). Not an active constraint on a
 * phone -- every page lands 18-28dp at 328dp of text width -- but a wider
 * column would walk into it silently, and a silently broken page looks like a
 * missing font rather than an oversized one.
 */
export const MUSHAF_MAX_FONT_SIZE = 40;

/** A floor, so a mid-layout zero height cannot make a line invisible. */
const MIN_LINE_HEIGHT = 1;

export function mushafFontSize(page: number, textWidth: number): number {
  if (!Number.isInteger(page) || page < MUSHAF_PAGE_MIN || page > MUSHAF_PAGE_MAX) {
    throw new RangeError(
      `mushaf page must be an integer ${MUSHAF_PAGE_MIN}..${MUSHAF_PAGE_MAX}, got ${page}`,
    );
  }
  const em = MUSHAF_PAGE_WIDEST_EM[page - 1];
  if (em === undefined || em <= 0) {
    // The generated file is 604 entries by construction, so this is a stale
    // or truncated generation -- say which page, not "NaN".
    throw new Error(`no metrics for mushaf page ${page}; run \`scraper mushaf-metrics\``);
  }
  return Math.min(textWidth / em, MUSHAF_MAX_FONT_SIZE);
}

export function mushafLineHeight(textHeight: number, lineCount: number): number {
  if (lineCount <= 0) return MIN_LINE_HEIGHT;
  return Math.max(textHeight / lineCount, MIN_LINE_HEIGHT);
}
