import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import type Animated from 'react-native-reanimated';
import {
  Easing,
  LinearTransition,
  ZoomIn,
  ZoomOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from './useReducedMotion';

export const REVEAL_MS = 200;
export const REVEAL_OUT_MS = 160;
export const PULSE_SCALE = 1.18;
export const PULSE_UP_MS = 120;
export const PULSE_DOWN_MS = 140;

type Entering = ComponentProps<typeof Animated.View>['entering'];
type Exiting = ComponentProps<typeof Animated.View>['exiting'];
type Layout = ComponentProps<typeof Animated.View>['layout'];

/** The three animations one bookmark tap is made of. */
export interface NoteReveal {
  /** The pen arriving. */
  entering?: Entering;
  /** The pen leaving, on un-bookmark. */
  exiting?: Exiting;
  /** Applied to the control row AND the audio control, which is what makes
   *  the bookmark travel and the audio control stay put -- see useNoteReveal. */
  layout?: Layout;
}

const NO_ANIMATION: NoteReveal = {};

/**
 * Pure, and separate from the hook, so the reduced-motion branch is testable
 * without a reanimated runtime -- the same split `pagerAnimation` and
 * `nextPressScale` use.
 *
 * Reduced motion gets no substitute fade (§8). Unlike a page turn, nothing
 * here moves far enough to need one: the pen simply is there, which is the
 * state the animation was only ever decorating.
 */
export function noteReveal(reduceMotion: boolean): NoteReveal {
  if (reduceMotion) return NO_ANIMATION;
  return {
    entering: ZoomIn.duration(REVEAL_MS),
    exiting: ZoomOut.duration(REVEAL_OUT_MS),
    layout: LinearTransition.duration(REVEAL_MS).easing(Easing.out(Easing.ease)),
  };
}

/**
 * Bookmarking an ayah adds a pen between the bookmark and the audio control,
 * and the row is right-aligned, so the row grows leftwards.
 *
 * The travel comes from `layout` on the row itself: the row's own frame moves
 * left and widens, and the bookmark sits at its leading edge, so it rides
 * along. The audio control needs the SAME `layout` for the opposite reason --
 * its offset inside the row grows by exactly what the row's origin loses, so
 * animating both leaves it standing still. Without it the audio control is
 * carried left with the row and then snaps back.
 */
export function useNoteReveal(): NoteReveal {
  return noteReveal(useReducedMotion());
}

/**
 * Whether a render should pulse the bookmark glyph.
 *
 * Only on the false -> true edge. Not on mount: every already-bookmarked ayah
 * scrolling into the reader would pulse, which is a list that twitches rather
 * than a control that responds. Not on un-bookmark either -- the pen leaving
 * is that tap's feedback.
 */
export function shouldPulse(bookmarked: boolean, wasBookmarked: boolean, reduceMotion: boolean): boolean {
  return bookmarked && !wasBookmarked && !reduceMotion;
}

/**
 * A 18% swell on the bookmark glyph as it fills, 120ms out and 140ms back.
 *
 * Applied to a View around the glyph, never to the Pressable: the Pressable
 * carries the 48dp touch target, and scaling that would move the target under
 * the finger that is still on it.
 */
export function useBookmarkPulse(bookmarked: boolean) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  // A ref rather than state: it drives no render, and its whole job is to
  // remember the previous committed value so mount is not mistaken for a tap.
  const wasBookmarked = useRef(bookmarked);

  useEffect(() => {
    const pulse = shouldPulse(bookmarked, wasBookmarked.current, reduceMotion);
    wasBookmarked.current = bookmarked;
    if (!pulse) return;
    scale.value = withSequence(
      withTiming(PULSE_SCALE, { duration: PULSE_UP_MS }),
      withTiming(1, { duration: PULSE_DOWN_MS }),
    );
  }, [bookmarked, reduceMotion, scale]);

  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}
