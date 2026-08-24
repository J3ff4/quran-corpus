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
export function useListBottomPadding(): number {
  return useSafeAreaInsets().bottom + 24;
}
