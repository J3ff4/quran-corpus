import { useEffect, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * Room around the clipped box for the surface's own drop shadow.
 *
 * The grow is a height animation, so the box has to clip -- and a clip tight
 * to the bar would shave the shadow that separates it from what is behind it
 * for as long as the player is on screen, not only while it moves. The content
 * is inset by this much and the box is pushed down by it, so the bar lands in
 * exactly the same place it would with no clip at all.
 */
export const SHADOW_ROOM = 16;

export interface PlayerShellProps {
  /** Which child is showing. The only thing that picks a height. */
  expanded: boolean;
  compact: ReactNode;
  full: ReactNode;
  /** Duration of the height curve. 0 under reduced motion. */
  growMs: number;
}

/**
 * A player that is one line at rest and a full transport while it sounds,
 * growing between the two.
 *
 * Layout only: docking, position and any chrome fade belong to the caller.
 * Extracted from the mushaf's player so Home's card can grow the same way --
 * one motion for one idea, rather than two implementations that drift.
 */
export function PlayerShell({ expanded, compact, full, growMs }: PlayerShellProps) {
  // Measured, never assumed. The full bar's height depends on the reciter
  // name's line count and on the type scale, and a constant would clip the
  // transport on whichever device disagreed.
  const [compactHeight, setCompactHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const target = expanded ? fullHeight : compactHeight;

  const height = useSharedValue(0);
  useEffect(() => {
    // Nothing measured yet. Skipping rather than animating to 0 is what keeps
    // the first frame from collapsing the bar it is about to draw.
    if (target <= 0) return;
    // The first measurement of either state snaps: there is no height to grow
    // FROM on the frame a state first appears, and a 0 -> full curve would
    // play an unasked-for entrance every time the player mounts.
    if (height.value === 0) height.value = target;
    else height.value = withTiming(target, { duration: growMs });
  }, [target, growMs, height]);
  const boxStyle = useAnimatedStyle(() =>
    // Not a bare 0: before the first measurement the box sizes to its content,
    // which is how the content gets measured.
    height.value > 0 ? { height: height.value + SHADOW_ROOM * 2 } : {},
  );

  function measure(set: (value: number) => void) {
    return (event: LayoutChangeEvent) => set(event.nativeEvent.layout.height);
  }

  return (
    <Animated.View pointerEvents="box-none" style={boxStyle}>
      {/* Absolute, and anchored to the bottom. Absolute because a child inside
          a height-animated clip otherwise measures the clip rather than itself
          and reports the height it is being given -- so the grow would run
          0 -> 0 for ever. Bottom-anchored because the bar grows upward from
          whatever it is docked above. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: SHADOW_ROOM, right: SHADOW_ROOM, bottom: SHADOW_ROOM }}
      >
        {expanded ? (
          <View testID="player-shell-full" onLayout={measure(setFullHeight)}>
            {full}
          </View>
        ) : (
          <View testID="player-shell-compact" onLayout={measure(setCompactHeight)}>
            {compact}
          </View>
        )}
      </View>
    </Animated.View>
  );
}
