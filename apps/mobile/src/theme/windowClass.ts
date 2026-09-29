import { useWindowDimensions } from 'react-native';

/**
 * Material's window size classes.
 *
 * Measured on the *window*, never the screen: Android multi-window hands the
 * app an arbitrary box, and a tablet in split-screen is genuinely a compact
 * window however large the panel it is glued to. Device detection would get
 * that backwards.
 */
export type WindowClass = 'compact' | 'medium' | 'expanded';

export const CLASS_MEDIUM_MIN = 600;
export const CLASS_EXPANDED_MIN = 840;

export function windowClassFor(width: number): WindowClass {
  if (width >= CLASS_EXPANDED_MIN) return 'expanded';
  if (width >= CLASS_MEDIUM_MIN) return 'medium';
  return 'compact';
}

export interface ColumnsInput {
  /** Width left for the cards, gaps included, padding already subtracted. */
  available: number;
  /** The narrowest this surface's card can be and still lay out -- a measured
   *  number from minCardWidths, not a guess. */
  minCardWidth: number;
  gap: number;
  windowClass: WindowClass;
  /** Android's own text scaling. Widens the minimum, never narrows it. */
  fontScale?: number;
}

/**
 * How many columns of `minCardWidth` fit in `available`.
 *
 * n cards carry n-1 gaps, not n: charging a gap per card loses most of a
 * column at every width. Solving `n*min + (n-1)*gap <= available` gives
 * `n <= (available + gap) / (min + gap)`.
 */
export function columnsFor({
  available,
  minCardWidth,
  gap,
  windowClass,
  fontScale = 1,
}: ColumnsInput): number {
  // Compact is the phone, and the phone is not changing. Guarded here rather
  // than at each call site so a new surface cannot forget it.
  if (windowClass === 'compact') return 1;

  // Scales below 1 are left alone: the minimums were measured at 1, and
  // narrowing them would pack in columns the design was never checked at.
  const effectiveMin = minCardWidth * Math.max(1, fontScale);
  const fitted = Math.floor((available + gap) / (effectiveMin + gap));

  // A window narrower than one card still has to draw one.
  return Math.max(1, fitted);
}

export function useWindowClass(): WindowClass {
  const { width } = useWindowDimensions();
  return windowClassFor(width);
}

export interface Columns {
  columns: number;
  /** The width to pin a cell to, or undefined in a single column -- where the
   *  cell should keep filling its parent exactly as it does on a phone. */
  itemWidth: number | undefined;
  windowClass: WindowClass;
}

/**
 * The column count for one surface, and the cell width that goes with it.
 *
 * `itemWidth` is undefined at one column on purpose: pinning a width there
 * would change the phone, and the phone must not change.
 */
export function useColumns(
  minCardWidth: number,
  { gap = 10, horizontalPadding = 32 }: { gap?: number; horizontalPadding?: number } = {},
): Columns {
  const { width, fontScale } = useWindowDimensions();
  const windowClass = windowClassFor(width);
  const available = Math.max(0, width - horizontalPadding);
  const columns = columnsFor({ available, minCardWidth, gap, windowClass, fontScale });

  return {
    columns,
    itemWidth: columns > 1 ? (available - gap * (columns - 1)) / columns : undefined,
    windowClass,
  };
}
