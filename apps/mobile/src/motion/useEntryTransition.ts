import { useCallback, useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';

import { useReducedMotion } from './useReducedMotion';

/** Which way the reader is paging, or null when the entry changed for some
 *  other reason -- a deep link, a tap on a concordance root, a back. */
export type PageSide = 'prev' | 'next' | null;

export const ENTER_MS = 260;
export const FADE_MS = 160;

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
  // Refs, not state: neither drives a render, and a setState here would run a
  // second render between the tap and the navigation.
  const sideRef = useRef<PageSide>(null);
  const shownRef = useRef(entryKey);

  const markSide = useCallback((side: PageSide) => {
    sideRef.current = side;
  }, []);

  useEffect(() => {
    if (shownRef.current === entryKey) return;
    shownRef.current = entryKey;
    // Consumed, not left standing: the next entry may arrive from a deep link
    // or a concordance tap, and a stale side would slide it as though the
    // reader had paged there.
    const side = sideRef.current;
    sideRef.current = null;

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
