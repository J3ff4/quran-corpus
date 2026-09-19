import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/**
 * Duration of the compact <-> full grow, for every player surface.
 *
 * One constant, not one per caller: two screens growing the same bar at two
 * speeds is the drift this shell was extracted to stop. 180ms read as a snap
 * and 280ms still did (owner, 2026-09-15 and 2026-09-19) -- the bar unfolds
 * under the thumb that pressed play, and that unfolding is worth seeing.
 */
export const PLAYER_GROW_MS = 400;

export interface PlayerShellProps {
  /** Which child is showing. The only thing that picks a height. */
  expanded: boolean;
  compact: ReactNode;
  full: ReactNode;
  /** Duration of the height curve. 0 under reduced motion. */
  growMs: number;
  /**
   * Room around the clip for the surface's own drop shadow, per side.
   *
   * SHADOW_ROOM by default, which is what a floating bar over a page wants.
   * **0 for a player that sits IN a stack of cards**: the room is invisible
   * but it is layout, so it inset Home's card 16dp from both screen edges and
   * stacked on the screen's own gap -- the card was narrower than every other
   * card on the tab and read as dropped onto the screen rather than part of it
   * (owner, twice, 2026-09-16). With no room the clip is tight and the
   * surface's shadow is shaved, which is the trade: a card in a stack is
   * asked to match its neighbours, not to float above them.
   */
  room?: number;
}

/**
 * A player that is one line at rest and a full transport while it sounds,
 * growing between the two.
 *
 * Layout only: docking, position and any chrome fade belong to the caller.
 * Extracted from the mushaf's player so Home's card can grow the same way --
 * one motion for one idea, rather than two implementations that drift.
 */
export function PlayerShell({ expanded, compact, full, growMs, room = SHADOW_ROOM }: PlayerShellProps) {
  // Measured, never assumed. The full bar's height depends on the reciter
  // name's line count and on the type scale, and a constant would clip the
  // transport on whichever device disagreed.
  const [compactHeight, setCompactHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const target = expanded ? fullHeight : compactHeight;

  const height = useSharedValue(0);
  // Which state the height on screen belongs to. The curve exists for the
  // compact <-> full change and nothing else, so a new measurement of the
  // state already showing has to SNAP.
  //
  // Without that, any re-layout of the resting bar played the full grow curve
  // to a height a pixel or two away -- which is the visible dip the owner caught
  // after picking a reciter on the mushaf (2026-09-15): the sheet closing
  // re-measures the bar underneath it, and the bar sagged and came back.
  const shown = useRef<boolean | null>(null);
  // When the curve now running was issued. A re-measure that lands INSIDE it is
  // the state change's own measurement arriving late -- only the active child
  // is mounted, so the height a transition is issued against is the last one
  // measured for that state, and the true one lands a commit later. Snapping
  // there would cut the grow off mid-flight; it retargets instead, over
  // whatever is left of the curve.
  const startedAt = useRef(0);
  useEffect(() => {
    // Nothing measured yet. Skipping rather than animating to 0 is what keeps
    // the first frame from collapsing the bar it is about to draw.
    if (target <= 0) return;
    const changed = shown.current !== expanded;
    shown.current = expanded;
    // The first measurement of either state snaps: there is no height to grow
    // FROM on the frame a state first appears, and a 0 -> full curve would
    // play an unasked-for entrance every time the player mounts.
    if (height.value === 0) {
      height.value = target;
      return;
    }
    if (changed) {
      startedAt.current = Date.now();
      height.value = withTiming(target, { duration: growMs });
      return;
    }
    const elapsed = Date.now() - startedAt.current;
    if (elapsed < growMs) {
      height.value = withTiming(target, { duration: growMs - elapsed });
      return;
    }
    // A re-layout of the state already showing, long after it settled. Not a
    // transition, so no curve -- see the dip this fixed.
    height.value = target;
  }, [target, expanded, growMs, height]);
  const boxStyle = useAnimatedStyle(() =>
    // Not a bare 0: before the first measurement the box sizes to its content,
    // which is how the content gets measured.
    height.value > 0 ? { height: height.value + room * 2 } : {},
    [room],
  );

  function measure(set: (value: number) => void) {
    return (event: LayoutChangeEvent) => set(event.nativeEvent.layout.height);
  }

  return (
    // Clipped here, not by the caller. The child is absolute and keeps its
    // full intrinsic height while this box animates, and RN's default overflow
    // is visible -- so a caller without a clipping parent of its own (Home's
    // card has none) paints the whole transport before the grow has run.
    <Animated.View pointerEvents="box-none" style={[{ overflow: 'hidden' }, boxStyle]}>
      {/* Absolute, and anchored to the bottom. Absolute because a child inside
          a height-animated clip otherwise measures the clip rather than itself
          and reports the height it is being given -- so the grow would run
          0 -> 0 for ever. Bottom-anchored because the bar grows upward from
          whatever it is docked above. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: room, right: room, bottom: room }}
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
