import { MUSHAF_PAGE_MAX, MUSHAF_PAGE_MIN } from '@quran-corpus/data/mobile';

/**
 * How many leaves the mushaf has, if every page is paired from the right.
 *
 * Derived, not written: the page bounds are the shared package's fact (the
 * pager imports the same two constants), and a second copy of 604 here would
 * be free to disagree with it. The ceiling covers an odd page count, where the
 * last leaf carries a recto with no verso.
 */
export const SPREAD_COUNT = Math.ceil((MUSHAF_PAGE_MAX - MUSHAF_PAGE_MIN + 1) / 2);

export interface Spread {
  /** 0-based leaf index -- what the pager pages across. */
  index: number;
  /** The right-hand page. Always odd, which is the whole of ruling R-B3. */
  recto: number;
  /** The left-hand page. Never null at 604 pages, but typed for it so a future
   *  edition with an odd page count cannot silently pair off the end. */
  verso: number | null;
}

function assertPage(page: number): void {
  if (!Number.isInteger(page) || page < MUSHAF_PAGE_MIN || page > MUSHAF_PAGE_MAX) {
    throw new RangeError(
      `mushaf page must be an integer ${MUSHAF_PAGE_MIN}..${MUSHAF_PAGE_MAX}, got ${String(page)}`,
    );
  }
}

/**
 * The leaf a page sits on.
 *
 * Pairs are anchored from the right and FIXED: (1,2), (3,4) ... (603,604). So a
 * page is always on the same half of the same leaf, which is what makes "open
 * where I left off" land somewhere stable. Deriving the pair from whichever
 * page was asked for -- (4,5) for page 4 -- would make every page its own
 * recto and shift the whole book by one every time an even page was opened.
 */
export function spreadFor(page: number): Spread {
  assertPage(page);
  const recto = page % 2 === 1 ? page : page - 1;
  const verso = recto + 1 <= MUSHAF_PAGE_MAX ? recto + 1 : null;
  return { index: (recto - MUSHAF_PAGE_MIN) / 2, recto, verso };
}

export function spreadAt(index: number): Spread {
  if (!Number.isInteger(index) || index < 0 || index >= SPREAD_COUNT) {
    throw new RangeError(
      `spread index must be an integer 0..${SPREAD_COUNT - 1}, got ${String(index)}`,
    );
  }
  return spreadFor(index * 2 + MUSHAF_PAGE_MIN);
}

export function spreadIndexFor(page: number): number {
  return spreadFor(page).index;
}
