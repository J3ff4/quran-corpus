/** The gap between segments, in points.
 *
 *  Exported rather than written twice: the geometry below describes a row that
 *  SegmentedControl lays out, and a gap that disagreed between the two would
 *  slide the pill a few points off its segment -- a drift that grows with the
 *  index, so the first tab would look right and the last would not.
 */
export const SEGMENT_GAP = 4;

/** The pill's travel. Springy rather than timed: the segment it lands on is a
 *  target, and a spring settles on one the way a timed curve does not. */
export const PILL_SPRING = { damping: 22, stiffness: 240, mass: 0.7 } as const;

/**
 * How wide one segment is, given the row's measured width.
 *
 * Every segment is `flex: 1` off the same zero basis, so they are all equal and
 * the pill's geometry follows from the row alone -- one `onLayout` on the row
 * instead of one per segment, none of which can arrive late or out of order.
 *
 * Returns 0 for a row that has not been measured yet, and for a row too narrow
 * to hold its own gaps. Both are the caller's signal not to draw the pill at
 * all: a pill sized from 0 is a sliver parked at the left edge, which would be
 * the first frame of every mount.
 */
export function segmentWidth(rowWidth: number, count: number): number {
  if (rowWidth <= 0 || count <= 0) return 0;
  const width = (rowWidth - SEGMENT_GAP * (count - 1)) / count;
  return width > 0 ? width : 0;
}

/** Where the pill's left edge sits for the segment at `index`. */
export function pillOffset(index: number, width: number): number {
  return index * (width + SEGMENT_GAP);
}
