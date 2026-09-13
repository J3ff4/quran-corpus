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
  // True until the first measurement lands on a curtain that MOUNTED open.
  // Without it such a curtain replays its unroll from 0 every time it is
  // built -- a juz card scrolled out of the FlatList's window and back
  // animates open again, as does any remount of a header whose actions were
  // left open. An open curtain arriving on screen is not an opening.
  const openOnMount = useRef(open);

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
          // **Absolutely positioned, and that is the whole mechanism.**
          //
          // In flow, this view is a child of a clip whose height is 0 until
          // something measures it -- and the only thing that measures it is
          // this view's own onLayout. On the device that circle never broke:
          // the chevron turned, the header's button swapped to its close
          // glyph, and nothing opened (owner, device, 2026-09-11).
          //
          // Out of flow, its height is its content's and owes nothing to the
          // parent's, so the measurement is available on the first layout
          // pass and the clip has a target to travel to. left/right rather
          // than a width: the content still has to fill the card it sits in.
          style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
          onLayout={(event: LayoutChangeEvent) => {
            const next = event.nativeEvent.layout.height;
            if (next <= 0 || next === measured.current) return;
            const snap = openOnMount.current;
            openOnMount.current = false;
            measured.current = next;
            // Only while open: a layout arriving mid-close must not re-inflate
            // the clip we are in the middle of shutting.
            if (!open) return;
            height.value =
              reduceMotion || snap ? next : withTiming(next, { duration: UNROLL_MS });
          }}
        >
          {children}
        </View>
      ) : null}
    </Animated.View>
  );
}
