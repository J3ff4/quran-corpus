/** The gap between segments, in points.
 *
 *  Exported rather than written twice: the geometry below describes a row that
 *  SegmentedControl lays out, and a gap that disagreed between the two would
 *  slide the pill a few points off its segment -- a drift that grows with the
 *  index, so the first tab would look right and the last would not.
 */
export const SEGMENT_GAP = 4;

/** The pill's travel. Springy rather than timed: the segment it lands on is a
 *  target, and a spring settles on one the way a timed curve does not.
 *
 *  Tuned on device 2026-08-31: the previous {22, 240, 0.7} settled in ~260ms
 *  with no overshoot, which read as the pill being dragged rather than
 *  responding. This lands in ~170ms and passes the target by about 4% once.
 *  Underdamped on purpose -- damping is below the critical 2*sqrt(k*m) ~= 31
 *  for these values, and that single small bounce is the whole point. */
/**
 * How long to hold a segment's `onChange` back, in ms.
 *
 * Tied to PILL_SPRING below and must not drift from it: this is that spring's
 * settle time plus a small margin.
 *
 * Measured on device 2026-08-31, per-frame via `dumpsys gfxinfo framestats`.
 * Applying the change on press put the screen's re-render -- 604 page rows,
 * the whole juz index -- inside the spring's opening frames, and Fabric mounts
 * on the UI thread, which is the same thread the spring runs on. In the 250ms
 * the pill is travelling, 5 to 10 of 22 frames were dropped, always as one
 * 45-89ms hole a few frames in: the pill left, stopped dead, then finished its
 * bounce late. That is exactly what "goes and freezes for a sec and then
 * continues" describes.
 *
 * Holding the change until the pill lands gave 0 to 1 dropped frames of 22
 * across three switches x three runs, worst gap 20ms -- a clean 90fps travel.
 * The cost is that content arrives 220ms after the tap, on a control where the
 * eye is following the pill; the alternative was making every row free, and a
 * row stripped to a bare box still dropped 3 to 13 frames, so the mount could
 * never have been made cheap enough.
 */
export const PILL_SETTLE_MS = 220;

export const PILL_SPRING = { damping: 15, stiffness: 400, mass: 0.6 } as const;

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
