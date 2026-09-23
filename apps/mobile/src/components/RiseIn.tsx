import { useEffect, useRef, useState, type ReactNode } from 'react';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { LayoutChangeEvent } from 'react-native';

import { useReducedMotion } from '@/motion/useReducedMotion';

// The sheet's curve, not a second one. BottomSheet arrives decelerating and
// leaves accelerating over Android's own sheet durations, and the owner asked
// for the search jump card to move the way the reader's word sheet does
// (2026-09-23). Kept as literals here rather than exported from BottomSheet:
// that module pulls Modal, gesture-handler and the keyboard listeners, none of
// which an inline card has any use for.
const ENTER = { duration: 220, easing: Easing.out(Easing.cubic) } as const;
const EXIT = { duration: 180, easing: Easing.in(Easing.cubic) } as const;
const FADE_MS = 150;

export interface RiseInProps {
  open: boolean;
  children: ReactNode;
  testID?: string;
}

/**
 * Content that rises into its own place and fades, the way the sheets do.
 *
 * Not a Collapsible. The curtain animates the clip's HEIGHT, so the rows below
 * it travel with the content -- which is what the search results wanted until
 * the owner watched it on the device and ruled the height animation out
 * (2026-09-23): the GO TO card is the one result that appears and disappears
 * while you are still typing, and a section that grows and shrinks under the
 * finger reads worse than one that simply arrives. This animates the content
 * only; the rows below take their positions at once.
 *
 * The rise distance is the content's own measured height, so the card comes
 * from under where it lands -- the sheet's relationship to the screen edge,
 * scaled to a card. Before the first measurement it is invisible, so nothing
 * is ever seen in the wrong place.
 */
export function RiseIn({ open, children, testID }: RiseInProps) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Trails the close by one animation: children have to stay mounted for the
  // exit to have anything to move.
  const [mounted, setMounted] = useState(open);
  const height = useRef(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (reduced) {
        translateY.value = 0;
        opacity.value = 1;
        return;
      }
      // No height yet means this is the first open and onLayout will start it.
      if (height.current <= 0) return;
      translateY.value = height.current;
      translateY.value = withTiming(0, ENTER);
      opacity.value = withTiming(1, { duration: FADE_MS });
      return;
    }
    if (reduced) {
      opacity.value = 0;
      setMounted(false);
      return;
    }
    translateY.value = withTiming(height.current, EXIT);
    opacity.value = withTiming(0, { duration: FADE_MS }, (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(setMounted)(false);
    });
  }, [open, reduced, opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!mounted) return null;

  return (
    <Animated.View
      testID={testID}
      style={style}
      onLayout={(event: LayoutChangeEvent) => {
        const next = event.nativeEvent.layout.height;
        if (next <= 0 || next === height.current) return;
        const first = height.current === 0;
        height.current = next;
        // Only the first measurement starts anything: a later one is the card
        // relabelling itself (a surah name arriving), and replaying the
        // entrance for that would make the card jump while it is being read.
        if (!first || !open) return;
        if (reduced) {
          opacity.value = 1;
          return;
        }
        translateY.value = next;
        translateY.value = withTiming(0, ENTER);
        opacity.value = withTiming(1, { duration: FADE_MS });
      }}
    >
      {children}
    </Animated.View>
  );
}
