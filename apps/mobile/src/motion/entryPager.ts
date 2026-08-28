import { useCallback, useRef, useState } from 'react';
import type Animated from 'react-native-reanimated';
import {
  FadeIn,
  FadeOut,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from 'react-native-reanimated';
import type { ComponentProps } from 'react';

import { useReducedMotion } from './useReducedMotion';

/** Which way the reader is paging, or null when the entry changed for some
 *  other reason -- a deep link, a tap on a concordance root, a back. */
export type PageSide = 'prev' | 'next' | null;

export const PAGE_MS = 260;
export const FADE_MS = 160;

type Entering = ComponentProps<typeof Animated.View>['entering'];
type Exiting = ComponentProps<typeof Animated.View>['exiting'];

/** The pair of layout animations one page turn is made of.
 *
 *  Both halves, because owner ruling (2026-08-27) is a *true* pager: the entry
 *  being left slides out as the one arriving slides in, the two moving
 *  together. Reanimated keeps an exiting view alive in the native hierarchy
 *  after React has dropped it, which is what makes that possible without
 *  either screen holding two entries' worth of state.
 *
 *  An empty pair means "do not animate": there is no direction to honour, and
 *  inventing one animates arriving somewhere as though the reader had paged
 *  there. */
export interface PagerAnimation {
  entering?: Entering;
  exiting?: Exiting;
}

const NO_ANIMATION: PagerAnimation = {};

/** Which way the two halves travel.
 *
 *  Pure and separate from the hook so the direction is testable without a
 *  reanimated runtime -- the same split `nextPressScale` uses.
 *
 *  Next brings the incoming entry in from the right and takes the outgoing one
 *  off to the left; Previous is the mirror. Reduced motion cross-fades instead
 *  (§8): a full-width slide of the whole screen is exactly the vestibular
 *  trigger that setting exists for. */
export function pagerAnimation(side: PageSide, reduceMotion: boolean): PagerAnimation {
  if (side === null) return NO_ANIMATION;
  if (reduceMotion) {
    return { entering: FadeIn.duration(FADE_MS), exiting: FadeOut.duration(FADE_MS) };
  }
  return side === 'next'
    ? { entering: SlideInRight.duration(PAGE_MS), exiting: SlideOutLeft.duration(PAGE_MS) }
    : { entering: SlideInLeft.duration(PAGE_MS), exiting: SlideOutRight.duration(PAGE_MS) };
}

/**
 * Paging between dictionary entries, in place.
 *
 * The pager used to call `router.replace` with the next entry's parameter.
 * That cost it both halves of the animation at once: expo-router remounts a
 * `[param]` screen when `replace` changes the param, so the outgoing entry was
 * destroyed before the incoming one rendered (nothing left to slide out), and
 * the navigator ran its own push transition over the top -- which is what was
 * animating the back arrow and fighting the entry's slide for the same frames.
 *
 * So paging no longer navigates. The route parameter seeds this state and
 * nothing writes it back afterwards: on device there is no address bar to
 * disagree with, `replace` left no history entry to correct either, and the
 * parameter is still validated at the route, which is the boundary that
 * matters. A genuine arrival at the route -- a deep link, a concordance tap
 * that pushed a different entry -- comes in as a changed `routeKey` and
 * resets this.
 */
export function useEntryPager(routeKey: string | null) {
  const [state, setState] = useState({ key: routeKey, current: routeKey });
  const reduceMotion = useReducedMotion();
  // A ref, not state: it does not drive a render, and it is read during the
  // render that mounts the incoming entry -- which is the render that hands
  // the animation to reanimated. A component-scoped ref is safe again now that
  // paging does not remount the screen.
  const sideRef = useRef<PageSide>(null);

  // Reset during render, not in an effect. An effect runs after the render
  // that saw the new route key, so for one commit this hook still reported the
  // *previous* entry -- long enough for the screen above to fire a query for
  // it, which its own cancellation flag then threw away. The one thing render
  // may not do is write a ref another component can observe; this one is read
  // two lines below, in this same render, by this same component.
  if (state.key !== routeKey) {
    // No direction: this entry did not arrive from the pager.
    sideRef.current = null;
    setState({ key: routeKey, current: routeKey });
  }

  const goTo = useCallback((target: string, side: PageSide) => {
    sideRef.current = side;
    setState((currentState) => ({ ...currentState, current: target }));
  }, []);

  return { current: state.current, goTo, animation: pagerAnimation(sideRef.current, reduceMotion) };
}

/**
 * The last fully-loaded entry, kept on screen while the next one loads.
 *
 * Both entry screens need three queries to settle before they can draw
 * anything, and blanking to a spinner in between is what made paging read as
 * "the entry vanished, then something slid in". Holding the previous one until
 * its replacement is ready is what leaves reanimated something to slide out.
 *
 * Written during render rather than in an effect: an effect runs after paint,
 * so the incoming entry would land un-animated for one frame first.
 */
export function useHeldEntry<T>(ready: T | null): T | null {
  const held = useRef<T | null>(null);
  if (ready !== null) held.current = ready;
  return held.current;
}
