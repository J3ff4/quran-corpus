import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from './useReducedMotion';

export const RESTING_SCALE = 1;
export const PRESSED_SCALE = 0.97;

/** Pure so the branch is testable without a reanimated runtime. */
export function nextPressScale(phase: 'in' | 'out', reduceMotion: boolean): number {
  if (reduceMotion) return RESTING_SCALE;
  return phase === 'in' ? PRESSED_SCALE : RESTING_SCALE;
}

/**
 * A 3% squeeze on press, 120ms each way. The only motion on a plain tap.
 *
 * Spread onto an animated Pressable:
 * `<AnimatedPressable onPressIn={press.onPressIn} onPressOut={press.onPressOut}
 *  style={[press.style, ...]}>`, where AnimatedPressable is
 * `Animated.createAnimatedComponent(Pressable)` -- a plain Pressable ignores
 * the animated style silently.
 */
export function usePressScale() {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(RESTING_SCALE);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return {
    scale,
    style,
    onPressIn: () => {
      scale.value = withTiming(nextPressScale('in', reduceMotion), { duration: 120 });
    },
    onPressOut: () => {
      scale.value = withTiming(nextPressScale('out', reduceMotion), { duration: 120 });
    },
  };
}
