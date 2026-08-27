import { useCallback, useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';

import { useReducedMotion } from './useReducedMotion';

/** Which way the reader is paging, or null when the entry changed for some
 *  other reason -- a deep link, a tap on a concordance root, a back. */
export type PageSide = 'prev' | 'next' | null;

export const ENTER_MS = 260;
export const FADE_MS = 160;

/** The side of the pager that was pressed, waiting for the entry it belongs to
 *  to appear.
 *
 *  Module-level rather than a ref inside the hook, because expo-router
 *  remounts a [param] screen when `replace` changes the param: the outgoing
 *  instance's refs are gone before the incoming one renders, so a ref set on
 *  the tap can never reach the screen it was meant to animate. Traced on
 *  device 2026-08-27 -- the effect ran with its own key already recorded as
 *  shown and the side back at null, so nothing animated at all. The side
 *  belongs to the navigation event, not to a component instance, which is the
 *  scope this variable has.
 *
 *  It is read once and cleared, so a tap that somehow does not navigate cannot
 *  leave a direction behind for a later deep link to inherit. */
let pendingSide: PageSide = null;

/** Where the incoming entry starts, in pixels from its resting place.
 *
 *  Pure so the direction is testable without a reanimated runtime, the same
 *  split nextPressScale uses.
 *
 *  Owner ruling D4: Next slides the incoming entry in from the right,
 *  Previous from the left. Reduced motion gets 0 and is cross-faded instead
 *  (§8) -- a full-width slide is exactly the vestibular trigger the setting
 *  exists for. An entry that arrived by any route other than the pager also
 *  gets 0: it has no direction, and picking one would animate a deep link as
 *  though the reader had swiped to it. */
export function enterOffset(side: PageSide, reduceMotion: boolean, width: number): number {
  if (reduceMotion || side === null) return 0;
  return side === 'next' ? width : -width;
}

/**
 * The pager's directional slide, for the two dictionary entry screens.
 *
 * Enter-only, no exit: both screens render a full-screen spinner while the
 * next entry's three queries run, so there is nothing left of the outgoing one
 * to animate out by the time the new key lands. What the reader sees is the
 * incoming entry arriving from the side they pressed, which is what D4 asked
 * for.
 *
 * `entryKey` is the identity of what is on screen -- a root's Buckwalter, a
 * lemma's. The animation runs when it changes, and the direction comes from
 * `markSide`, which the pager calls on the tap that causes the change.
 */
export function useEntryTransition(entryKey: string | null) {
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  // A ref, not state: it does not drive a render, and a setState here would
  // run a second render between the tap and the navigation.
  const shownRef = useRef(entryKey);

  const markSide = useCallback((side: PageSide) => {
    pendingSide = side;
  }, []);

  useEffect(() => {
    const changed = shownRef.current !== entryKey;
    shownRef.current = entryKey;
    // Nothing is drawn yet -- the screen is still showing its spinner while
    // the entry's queries run. The pending side is left standing on purpose:
    // it belongs to the entry that has not arrived, and consuming it here
    // spends the direction on a frame the reader never sees.
    if (entryKey === null) return;
    // Consumed, not left standing: the next entry may arrive from a deep link
    // or a concordance tap, and a stale side would slide it as though the
    // reader had paged there.
    const side = pendingSide;
    pendingSide = null;
    // A remount lands here with the new key already recorded as shown, so the
    // pending side -- not a changed key -- is what says the pager caused this.
    if (!changed && side === null) return;

    const from = enterOffset(side, reduceMotion, width);
    translateX.value = from;
    opacity.value = 0;
    if (from !== 0) {
      translateX.value = withTiming(0, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) });
    }
    opacity.value = withTiming(1, { duration: from === 0 ? FADE_MS : ENTER_MS });
  }, [entryKey, reduceMotion, width, translateX, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return { style, markSide };
}
