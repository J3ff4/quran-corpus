import { useRef } from 'react';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

/**
 * Safe-area insets as they were while the system bars were up.
 *
 * Hiding a system bar collapses its inset to 0, and the mushaf hides both of
 * them (M8 ruling 1). Every layout reading the live value therefore reflows the
 * moment the chrome leaves -- the tabs navigator's `sceneStyle.paddingTop` most
 * of all, which would drag the page up by the height of the status bar and drop
 * it back on the next tap. Ruling 2 says the page does not move.
 *
 * Last non-zero rather than a value gated on a `live` flag: the flag would be
 * chrome-visibility state, and subscribing the tabs navigator to that re-renders
 * every mounted tab -- including the pager's 604 children -- twice per toggle.
 * A zero inset means a hidden bar and nothing else, so it carries the same
 * information with no subscription at all.
 *
 * A ref, not state: it is read in the same render that writes it, and a
 * setState here would paint one frame at the collapsed inset before correcting
 * itself, which is the reflow this exists to prevent.
 */
export function useStableInsets(): EdgeInsets {
  const live = useSafeAreaInsets();
  const held = useRef(live);
  const previous = held.current;

  // A fresh object only when something actually changed, so consumers using it
  // in a dependency list do not re-run on every render.
  const next: EdgeInsets = {
    top: live.top || previous.top,
    bottom: live.bottom || previous.bottom,
    left: live.left || previous.left,
    right: live.right || previous.right,
  };
  if (
    next.top !== previous.top ||
    next.bottom !== previous.bottom ||
    next.left !== previous.left ||
    next.right !== previous.right
  ) {
    held.current = next;
  }
  return held.current;
}
