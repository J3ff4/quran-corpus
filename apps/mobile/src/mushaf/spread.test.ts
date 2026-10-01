import { describe, expect, it } from 'vitest';
import { MUSHAF_PAGE_MAX, MUSHAF_PAGE_MIN } from '@quran-corpus/data/mobile';

import { SPREAD_COUNT, spreadAt, spreadFor, spreadIndexFor } from './spread';

describe('spreadFor', () => {
  it('puts an odd page on the right and its successor on the left', () => {
    // RTL: the recto leads. Page 3 is always the right half of its own spread,
    // never the left -- that is the whole of ruling R-B3.
    expect(spreadFor(3)).toEqual({ index: 1, recto: 3, verso: 4 });
  });

  it('resolves an even page to the spread it shares, still recto-identified', () => {
    // Page 4 is the LEFT half of spread (3,4). Asking for page 4 must not
    // invent a spread (4,5) -- that would make every page its own recto and
    // the pairing would shift by one every time an even page was opened.
    expect(spreadFor(4)).toEqual({ index: 1, recto: 3, verso: 4 });
  });

  it('opens with 1 and 2 facing each other', () => {
    // Al-Fatiha faces al-Baqara's opening, as it does in print, so nothing is
    // orphaned and every recto stays odd.
    expect(spreadFor(1)).toEqual({ index: 0, recto: 1, verso: 2 });
  });

  it('closes on 603 and 604 with nothing orphaned', () => {
    expect(spreadFor(MUSHAF_PAGE_MAX)).toEqual({
      index: SPREAD_COUNT - 1,
      recto: 603,
      verso: 604,
    });
    expect(SPREAD_COUNT).toBe(302);
  });

  it('round-trips every page in the mushaf', () => {
    // The property that matters: a page is on exactly one leaf, that leaf
    // contains it, and the index round-trips. A loop over all 604, because an
    // off-by-one at either end passes every spot check in the middle.
    for (let page = MUSHAF_PAGE_MIN; page <= MUSHAF_PAGE_MAX; page += 1) {
      const spread = spreadFor(page);
      expect([spread.recto, spread.verso]).toContain(page);
      expect(spreadAt(spread.index)).toEqual(spread);
      expect(spreadIndexFor(page)).toBe(spread.index);
    }
  });

  it('covers the book exactly once, leaf by leaf', () => {
    // From the other direction: walking the leaves must visit all 604 pages
    // with no gap and no repeat. spreadFor's round-trip cannot see a leaf that
    // no page maps to.
    const seen = new Set<number>();
    for (let index = 0; index < SPREAD_COUNT; index += 1) {
      const { recto, verso } = spreadAt(index);
      seen.add(recto);
      if (verso !== null) seen.add(verso);
    }
    expect(seen.size).toBe(MUSHAF_PAGE_MAX - MUSHAF_PAGE_MIN + 1);
  });

  it('rejects a page outside the mushaf', () => {
    // The page arrives from a pager index, a route param and the user DB, so
    // nothing upstream has range-checked it.
    expect(() => spreadFor(0)).toThrow(RangeError);
    expect(() => spreadFor(605)).toThrow(RangeError);
    expect(() => spreadFor(1.5)).toThrow(RangeError);
    expect(() => spreadFor(Number.NaN)).toThrow(RangeError);
  });

  it('rejects a spread index outside the book', () => {
    expect(() => spreadAt(-1)).toThrow(RangeError);
    expect(() => spreadAt(SPREAD_COUNT)).toThrow(RangeError);
    expect(() => spreadAt(1.5)).toThrow(RangeError);
  });
});
