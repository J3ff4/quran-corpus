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
 * The same squeeze, with no animation nodes behind it.
 *
 * For anything a list renders MANY of. `usePressScale` below creates a shared
 * value and an animated style per caller, and on Fabric those are built during
 * the commit that mounts the row -- which is the UI thread. Measured on device
 * 2026-08-31: switching the Surahs browse mode spent **450ms** in one
 * uninterrupted block with nothing else on the JS thread, and removing exactly
 * this hook from the row removed the block entirely (630ms to settle became
 * 284ms, with no dead window). That block is what froze the tab pill
 * mid-travel, and AlphabetGrid pays it 29 times at once on the Dictionary pane.
 *
 * The trade is a step instead of a tween: the scale snaps on press-in and back
 * on release rather than easing over 120ms. On a row you are already touching,
 * a 120ms ease is not what sells the press -- the response is -- and no tween
 * is worth a list that judders when it appears.
 *
 * Used as Pressable's own style callback, which is where the pressed state
 * already lives:
 * `<Pressable style={(state) => [pressStyle(state), ...]}>`
 */
export function usePressScaleStyle(): (state: { pressed: boolean }) => { transform: [{ scale: number }] } {
  const reduceMotion = useReducedMotion();
  return ({ pressed }) => ({
    transform: [{ scale: nextPressScale(pressed ? 'in' : 'out', reduceMotion) }],
  });
}

/**
 * A 3% squeeze on press, 120ms each way. The only motion on a plain tap.
 *
 * For controls a screen has a HANDFUL of. Anything a list repeats wants
 * `usePressScaleStyle` above instead -- see the measurement in its note.
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
