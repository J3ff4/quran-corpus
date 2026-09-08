import { describe, expect, it } from 'vitest';
import { MUSHAF_MAX_FONT_SIZE, mushafFontSize, mushafLineHeight } from './pageScale';
import { MUSHAF_PAGE_WIDEST_EM } from './pageMetrics.generated';

describe('mushafFontSize', () => {
  it('fills the width with the page-s widest line', () => {
    const em = MUSHAF_PAGE_WIDEST_EM[45]!; // page 46
    expect(mushafFontSize(46, 328)).toBeCloseTo(328 / em, 5);
  });

  it('caps at the size where Android drops whole-word glyphs', () => {
    // M7b saw pieces of these outlines dropped at 44px. The cap is a guard
    // rail: on a phone every page lands 18-28dp, so it should never bind --
    // but a tablet-width text column would sail past it unnoticed.
    expect(mushafFontSize(2, 4000)).toBe(MUSHAF_MAX_FONT_SIZE);
  });

  it('rejects a page outside 1..604 rather than reading undefined metrics', () => {
    expect(() => mushafFontSize(605, 328)).toThrow(RangeError);
    expect(() => mushafFontSize(0, 328)).toThrow(RangeError);
  });

  it('keeps every real page under the cap at phone width', () => {
    // The claim Finding 3 makes, asserted rather than trusted.
    for (let page = 1; page <= 604; page += 1) {
      expect(mushafFontSize(page, 328)).toBeLessThan(MUSHAF_MAX_FONT_SIZE);
    }
  });
});

describe('mushafLineHeight', () => {
  it('divides the height evenly between the lines', () => {
    expect(mushafLineHeight(600, 15)).toBe(40);
  });

  it('never returns zero or a negative for a squeezed page', () => {
    expect(mushafLineHeight(0, 15)).toBeGreaterThan(0);
  });
});
