import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/motion/useReducedMotion';

/** How long the curtain takes. Matched to PILL_SETTLE_MS's neighbourhood so
 *  the two motions in one header do not read as different machines. */
const UNROLL_MS = 220;

export interface CollapsibleProps {
  open: boolean;
  children: ReactNode;
  testID?: string;
}

/**
 * A curtain: content clipped from the top, dropping as one block.
 *
 * Height, not opacity. A fade leaves the rows in place and the card's
 * neighbours jump to their final positions on frame one; animating the clip's
 * height is what makes the list below travel with the content (owner ruling
 * R7, 2026-09-11).
 *
 * Children mount on open and stay mounted until the close lands -- unmounting
 * at the top of the close would collapse the clip to nothing instantly and
 * there would be no curtain to watch.
 *
 * The measured height is cached across a close, so a reopen has a target on
 * its first frame rather than animating from 0 to 0 and then jumping.
 */
export function Collapsible({ open, children, testID }: CollapsibleProps) {
  const reduceMotion = useReducedMotion();
  const height = useSharedValue(0);
  const measured = useRef(0);
  // Mount state, separate from `open`: it trails the close by one animation.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (measured.current > 0) {
        height.value = reduceMotion
          ? measured.current
          : withTiming(measured.current, { duration: UNROLL_MS });
      }
      return;
    }
    if (reduceMotion) {
      height.value = 0;
      setMounted(false);
      return;
    }
    height.value = withTiming(0, { duration: UNROLL_MS }, (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(setMounted)(false);
    });
  }, [open, reduceMotion, height]);

  const clipStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View testID={testID} style={[{ overflow: 'hidden' }, clipStyle]}>
      {mounted ? (
        <View
          onLayout={(event: LayoutChangeEvent) => {
            const next = event.nativeEvent.layout.height;
            if (next <= 0 || next === measured.current) return;
            measured.current = next;
            // Only while open: a layout arriving mid-close must not re-inflate
            // the clip we are in the middle of shutting.
            if (open) height.value = reduceMotion ? next : withTiming(next, { duration: UNROLL_MS });
          }}
        >
          {children}
        </View>
      ) : null}
    </Animated.View>
  );
}
