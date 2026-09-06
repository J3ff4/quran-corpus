/** The space between two bookmark cards, applied by the row rather than by the
 *  list.
 *
 *  It has to be the row's, because the exit has to close it: a row collapsed to
 *  zero height still leaves the space beside it, and that residue is what
 *  snapped shut when the reload landed. A list `gap` cannot be closed from
 *  inside a row -- FlatList wraps every item in a cell of its own, and Yoga
 *  clamps that cell at zero rather than letting a negative margin on the child
 *  pull it in, so paying the gap back from the row reached nothing at all
 *  (device, 2026-09-02: the neighbours rose, then jumped a second time).
 */
export const ROW_GAP = 10;

/** The ceiling a resting row is held under. A number, not `undefined`: a style
 *  property that changes type between frames is the one shape reanimated
 *  cannot interpolate. No card comes near it, so it constrains nothing until
 *  the collapse takes over. */
export const RESTING_MAX_HEIGHT = 100000;

/**
 * The space a leaving row occupies, at `collapse` of its way out.
 *
 * Pure, and separate from the worklet that consumes it, for the reason
 * `swipePanel` and `bookmarkReveal` are: the endpoints are the whole
 * correctness claim -- a row on its way out has to reach *nothing*, height and
 * gap together -- and a shared value driving an inline worklet commits no
 * output a test can read.
 *
 * Workletized, and that is not decoration: useAnimatedStyle runs its body on
 * the UI thread, where a plain imported function is not callable at all --
 * reanimated throws rather than hopping threads, and the throw takes the screen
 * down with it (device, 2026-09-03: opening Bookmarks crashed the app).
 * swipePanel's three exports carry the directive for the same reason.
 */
export function rowExit(collapse: number, rowHeight: number): { maxHeight: number; marginBottom: number } {
  'worklet';
  return {
    maxHeight: collapse > 0 ? Math.max(0, rowHeight * (1 - collapse)) : RESTING_MAX_HEIGHT,
    marginBottom: ROW_GAP * (1 - collapse),
  };
}
