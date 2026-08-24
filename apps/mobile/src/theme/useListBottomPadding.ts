import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Breathing room under the last row of a scrolling screen, plus whatever the
 *  device reserves for its gesture bar.
 *
 *  Every list in the app was flush against the bottom edge before this (owner
 *  device run, 2026-08-23): the last concordance row sat under the gesture
 *  bar with nothing between them. `react-native-safe-area-context` was already
 *  a dependency and had no call site anywhere in the app.
 *
 *  Used unconditionally, including on the tab screens, where the tab bar may
 *  already cover the gesture area: over-padding the end of a scroll is
 *  invisible, under-padding it is the defect this fixes, and one rule beats a
 *  per-screen judgement about which navigator is hosting a shared component
 *  (WbwScreen renders under both). */
/** Clearance for the floating tab pill (M6a).
 *
 *  The pill stands about 60pt tall (6pt padding each side of a 22pt icon, a 2pt
 *  gap and an 11pt label) and floats 12pt above the safe-area inset, so a list
 *  that cleared only the inset now ends underneath it. 88 is that plus the same
 *  breathing room the old `+ 24` gave.
 *
 *  Replaces the 24 rather than stacking on it: inset + 24 + 88 would leave an
 *  eighth of the screen empty under the last row on every stack screen. */
const TAB_PILL_CLEARANCE = 88;

export function useListBottomPadding(): number {
  return useSafeAreaInsets().bottom + TAB_PILL_CLEARANCE;
}
