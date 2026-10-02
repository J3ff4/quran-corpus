import { describe, expect, it } from 'vitest';
import {
  MUSHAF_MAX_FONT_SIZE,
  MUSHAF_MIN_FONT_SIZE,
  MUSHAF_PAGE_FOOTER_HEIGHT,
  mushafColumnForFontSize,
  mushafColumnWidth,
  mushafFontSize,
  mushafLeafFontSize,
  mushafLineFitFontSize,
  mushafLineHeight,
  mushafPageFontSize,
} from './pageScale';
import { MUSHAF_PAGE_LINE_EM, MUSHAF_PAGE_WIDEST_EM } from './pageMetrics.generated';

describe('mushafFontSize', () => {
  it('fills the width with the page-s widest line, less the rounding slack', () => {
    const em = MUSHAF_PAGE_WIDEST_EM[45]!; // page 46
    expect(mushafFontSize(46, 328)).toBeCloseTo((328 * 0.985) / em, 5);
  });

  it('leaves every page room to round into', () => {
    // The device run: at an exact fit Android rounds each glyph advance up and
    // the widest line ellipsises. Every page must draw its widest line inside
    // the column with a pixel or two to spare, not exactly at its edge.
    for (let page = 1; page <= 604; page += 1) {
      const em = MUSHAF_PAGE_WIDEST_EM[page - 1]!;
      const drawn = mushafFontSize(page, 328) * em;
      expect(drawn).toBeLessThan(328);
      // ...and the slack stays slack: a page shrunk to fit would read as a
      // narrower mushaf, which is the other way to fail this.
      expect(drawn).toBeGreaterThan(328 * 0.97);
    }
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

describe('mushafColumnWidth', () => {
  it('leaves a phone column alone -- nothing clamps at that width', () => {
    for (let page = 1; page <= 604; page += 1) {
      expect(mushafColumnWidth(page, 328)).toBe(328);
    }
  });

  it('narrows a tablet column to exactly what the page can still fill', () => {
    // The whole point: after narrowing, the font must land ON the cap rather
    // than under it, because a font under the cap means the column was cut
    // further than it had to be.
    for (const page of [1, 2, 46, 257, 604]) {
      const column = mushafColumnWidth(page, 1368);
      expect(column).toBeLessThan(1368);
      expect(mushafFontSize(page, column)).toBeCloseTo(MUSHAF_MAX_FONT_SIZE, 6);
    }
  });

  it('gives every page a column its pre-justified lines fill completely', () => {
    // The S3 defect stated as an assertion. `fill` is how much of the column
    // the text covers once the font is clamped; at 1368dp the median page
    // covered 47% of it before this existed.
    for (let page = 1; page <= 604; page += 1) {
      const column = mushafColumnWidth(page, 1368);
      // The ink this page lays down at the granted font size, in dp. It has to
      // come back out at the column width: that is what "fills it" means.
      const inked = (mushafFontSize(page, column) * MUSHAF_PAGE_WIDEST_EM[page - 1]!) / 0.985;
      expect(inked).toBeCloseTo(column, 4);
    }
  });

  it('rejects a page outside 1..604, like the font size does', () => {
    expect(() => mushafColumnWidth(605, 328)).toThrow(RangeError);
    expect(() => mushafColumnWidth(0, 328)).toThrow(RangeError);
  });
});

/** The width a page's text block gets on one half of a leaf.
 *
 *  The Tab S10+ in landscape (1400dp wide, less the chrome the reader measures
 *  around the pager) and the Fold's 939dp outer screen, both halved and less
 *  MushafPage's own 16dp margins either side. These are the two boxes the
 *  spread actually ships into. */
const HALF_TABLET = Math.floor(1400 / 2) - 32;
const HALF_FOLD = Math.floor(939 / 2) - 32;
/** The line box the tablet actually lays out in landscape.
 *
 *  Measured on the glass, not derived: the text block ran 112..1607px at
 *  density 2 on the Tab S10+ (2026-10-02), which is 747.5dp over 15 lines. */
const LINE_BOX_TABLET = mushafLineHeight(747.5, 15);
/** The line box a PHONE gets when it is turned on its side.
 *
 *  `app.json` leaves orientation `default`, so this ships. A phone measures
 *  ~360dp tall in landscape, which leaves 288dp over 15 lines -- 19.2dp of line
 *  for type that wants 2.2112em of it. An unfloored ink fit answers 8.7dp,
 *  so this is the box that makes the legibility assertion below bind. It is
 *  deliberately NOT derived from MUSHAF_PAGE_LINE_EM: a bound computed from the
 *  same table the code divides by is true by construction and asserts nothing,
 *  which is how an unreadable phone landscape shipped green once already. */
const LINE_BOX_PHONE_LANDSCAPE = mushafLineHeight(360 - MUSHAF_PAGE_FOOTER_HEIGHT, 15);

describe('mushafPageFontSize', () => {
  it('is the size the page has always arrived at, stated directly', () => {
    // It exists so a leaf can compare both halves before either has a column.
    // If it ever diverges from the column-then-size path the page itself uses,
    // the two halves of a leaf would be sized against a number the pages do
    // not draw at.
    for (let page = 1; page <= 604; page += 1) {
      for (const available of [328, HALF_FOLD, HALF_TABLET, 1368]) {
        expect(mushafPageFontSize(page, available)).toBe(
          mushafFontSize(page, mushafColumnWidth(page, available)),
        );
      }
    }
  });
});

describe('mushafLeafFontSize', () => {
  it('takes the smaller of the two halves, so neither page overflows', () => {
    // The larger fit is the one that does not fit on the other page: giving a
    // leaf the bigger of the two sizes runs the wider page past its half and
    // into the spine.
    for (let index = 0; index < 302; index += 1) {
      const recto = index * 2 + 1;
      const verso = recto + 1;
      const leaf = mushafLeafFontSize(recto, verso, HALF_TABLET, LINE_BOX_TABLET);
      // Both fits, on both halves: the width each page can fill and the ink its
      // tallest line needs. The smallest of the four is the leaf's size.
      const fits = [recto, verso].flatMap((page) => [
        mushafPageFontSize(page, HALF_TABLET),
        mushafLineFitFontSize(page, LINE_BOX_TABLET),
      ]);
      expect(leaf).toBe(Math.min(...fits));
      for (const fit of fits) expect(leaf).toBeLessThanOrEqual(fit);
    }
  });

  it('falls back to the recto alone on a leaf with no verso', () => {
    // 604 pages pair exactly, so this is the odd-edition guard -- the same one
    // Spread.verso is typed nullable for.
    expect(mushafLeafFontSize(603, null, HALF_TABLET, LINE_BOX_TABLET)).toBe(
      Math.min(
        mushafPageFontSize(603, HALF_TABLET),
        mushafLineFitFontSize(603, LINE_BOX_TABLET),
      ),
    );
  });

  it('actually differs from a per-page size on some leaf, or it asserts nothing', () => {
    // If every leaf's two pages happened to land on the same size, the whole
    // shared-size mechanism would be untested by the loop above and could be
    // deleted without a failure. Name the leaves where it bites.
    const divergent = [];
    for (let index = 0; index < 302; index += 1) {
      const recto = index * 2 + 1;
      const leaf = mushafLeafFontSize(recto, recto + 1, HALF_TABLET, LINE_BOX_TABLET);
      if (leaf !== mushafPageFontSize(recto, HALF_TABLET)) divergent.push(recto);
    }
    expect(divergent.length).toBeGreaterThan(0);
  });

  it('keeps every leaf inside the cap at both shipping half-boxes', () => {
    // The real render band: above ~44px Android drops pieces of these
    // whole-word outlines (M7b), and MUSHAF_MAX_FONT_SIZE is the guard. Halving
    // the box lowers the size, so a spread moves AWAY from that ceiling -- this
    // asserts it rather than reasoning about it. The floor is the phone's own
    // measured range (18-28dp at 328dp of text): a half-box page must not come
    // out smaller than the phone draws it, or the spread is less legible than
    // one page on a phone.
    for (const available of [HALF_FOLD, HALF_TABLET]) {
      for (const lineBox of [LINE_BOX_PHONE_LANDSCAPE, LINE_BOX_TABLET]) {
        for (let index = 0; index < 302; index += 1) {
          const leaf = mushafLeafFontSize(index * 2 + 1, index * 2 + 2, available, lineBox);
          expect(leaf).toBeLessThanOrEqual(MUSHAF_MAX_FONT_SIZE);
          expect(leaf).toBeGreaterThanOrEqual(18);
        }
      }
    }
  });
});

describe('MUSHAF_MIN_FONT_SIZE', () => {
  it('stops a short box from shrinking the page out of legibility', () => {
    // A phone in landscape cannot hold 15 lines of ~1.9em: the honest fit is
    // 8.7dp on the tallest page, which is not a reading surface. Below the
    // floor the old trade comes back -- the glyphs overhang their line -- and
    // that is the better of two bad renderings.
    const worst = MUSHAF_PAGE_LINE_EM.indexOf(Math.max(...MUSHAF_PAGE_LINE_EM)) + 1;
    expect(LINE_BOX_PHONE_LANDSCAPE / MUSHAF_PAGE_LINE_EM[worst - 1]!).toBeLessThan(
      MUSHAF_MIN_FONT_SIZE,
    );
    expect(mushafLineFitFontSize(worst, LINE_BOX_PHONE_LANDSCAPE)).toBe(MUSHAF_MIN_FONT_SIZE);
    // And never binds where the page is readable: the tablet's own line box
    // clears it on every page, so the floor cannot silently inflate type.
    for (let page = 1; page <= 604; page += 1) {
      expect(mushafLineFitFontSize(page, LINE_BOX_TABLET)).toBeGreaterThan(MUSHAF_MIN_FONT_SIZE);
    }
  });
});

describe('mushafColumnForFontSize', () => {
  it('round-trips with the font size, for every page', () => {
    // The page derives its column from a leaf-wide size through this, so a
    // column that does not come back out at the size it was built for would
    // either ellipsise the widest line or strand the block in its half.
    for (let page = 1; page <= 604; page += 1) {
      const size = mushafPageFontSize(page, HALF_TABLET);
      expect(mushafFontSize(page, mushafColumnForFontSize(page, size))).toBeCloseTo(size, 6);
    }
  });

  it('gives a page handed a smaller leaf size a narrower column', () => {
    // This is what puts the extra margin on the narrower page rather than
    // stretching its pre-justified lines, which they cannot do.
    const full = mushafColumnForFontSize(3, mushafPageFontSize(3, HALF_TABLET));
    expect(mushafColumnForFontSize(3, mushafPageFontSize(3, HALF_TABLET) - 4)).toBeLessThan(full);
  });

  it('rejects a page outside 1..604', () => {
    expect(() => mushafColumnForFontSize(605, 30)).toThrow(RangeError);
    expect(() => mushafColumnForFontSize(0, 30)).toThrow(RangeError);
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
