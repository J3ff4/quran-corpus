import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { GlassSurface } from './GlassSurface';
import { PILL_SETTLE_MS, PILL_SPRING, SEGMENT_GAP, pillOffset, segmentWidth } from '@/motion/segmentedPill';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { usePressScale } from '@/motion/usePressScale';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group, not the options -- see the note on the row below. */
  accessibilityLabel: string;
}

/**
 * A glass pill split into segments, one of which is selected.
 *
 * Generic over the value rather than the index: callers pass the value straight
 * into a query, and an index-based callback silently pairs the wrong query with
 * the wrong segment the moment an option is inserted.
 *
 * Not GlassTabBar, which looks similar and is not this: that one is bound to
 * the navigator (routes, navigate, tabPress, safe-area insets) and floats
 * absolutely over the screen. This selects a value inside one screen.
 *
 * Selection is signalled by wash AND weight AND colour, never colour alone
 * (§8, WCAG 1.4.1), plus accessibilityState.selected for TalkBack, which sees
 * none of the three.
 */
function Segment<T extends string>({
  option,
  selected,
  onPress,
}: {
  option: { value: T; label: string };
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useThemeColors();
  const press = usePressScale();

  return (
    <AnimatedPressable
      testID={`segment-${option.value}`}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        press.style,
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          // compact (40), not minimum (48): four segments cannot each be 48
          // wide on a 390pt frame, and the guideline measures the row, which
          // the padding below carries to 48.
          minHeight: touchTargets.compact,
          paddingHorizontal: 8,
          borderRadius: radii.pill,
          // No background of its own any more: the wash is one pill that
          // travels between segments (see below). A per-segment background
          // would paint a second wash under the travelling one for the frame
          // the two overlap.
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          color: selected ? theme.accent : theme.mutedText,
          fontSize: typography.caption,
          fontWeight: selected ? '700' : '500',
        }}
      >
        {option.label}
      </Text>
    </AnimatedPressable>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const theme = useThemeColors();
  const reduceMotion = useReducedMotion();
  const [rowWidth, setRowWidth] = useState(0);
  const offset = useSharedValue(0);
  // The offset the pill was last sent to, or null before the first placement.
  // A ref, not state: it drives no render. It does two jobs -- it keeps the
  // first placement from travelling (without it every mount slides the pill in
  // from the left edge, which reads as the control loading rather than
  // responding), and it lets the effect below tell "already there" from "needs
  // to move", so a press that has already started the travel is not restarted.
  const applied = useRef<number | null>(null);
  // The segment the user pressed, held until the caller's `value` catches up.
  //
  // `onChange` is deferred (see the press handler), so for PILL_SETTLE_MS the
  // prop still names the old segment. Without this the wash would arrive under
  // a segment whose label was still grey and light while the segment it left
  // stayed bold and accented -- the selection would read as being in two
  // places. Cleared, not left standing, so the prop remains the authority: a
  // caller that ignores `onChange` gets the pill and the label both put back.
  const [optimistic, setOptimistic] = useState<T | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nothing to flush on unmount: firing `onChange` at a parent that is going
  // away sets state on a dead screen, and the mode it would have applied is
  // one the user navigated off before it landed.
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );
  // The row width the pill was last placed against. A width change is a
  // resize, not a selection, and springing the pill across a rotation would
  // animate a layout event.
  const measured = useRef(0);

  // Clamped rather than left at -1: a value not in `options` is a caller bug,
  // and parking the pill under the first segment is a wrong highlight, where a
  // negative offset is the pill off the side of the control entirely.
  const shown = optimistic ?? value;
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === shown),
  );
  const width = segmentWidth(rowWidth, options.length);

  // Puts the pill at `target`, and remembers that it did.
  function place(target: number, animate: boolean) {
    // The reduced-motion branch gets no substitute fade (§8): the wash simply
    // is on the selected segment, which is the state the travel was only ever
    // decorating.
    offset.value = animate ? withSpring(target, PILL_SPRING) : target;
    applied.current = target;
  }

  // Deliberately without a dependency array. `value` is the authority on where
  // the pill belongs, and this runs after every render to enforce that -- which
  // covers the press below having already started the travel (target equals
  // what was applied, so nothing restarts) and a caller that ignores `onChange`
  // (the value never moved, so the pill is put back).
  useEffect(() => {
    if (optimistic !== null && optimistic === value) setOptimistic(null);
    if (width === 0) return;
    const resized = measured.current !== width;
    measured.current = width;
    const target = pillOffset(index, width);
    if (applied.current === target) return;
    place(target, applied.current !== null && !reduceMotion && !resized);
  });

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <GlassSurface radius="pill" style={{ padding: 4 }}>
      {/* The label lives here rather than on each option: four segments each
          announcing "Browse by" is four swipes of the same words.

          No `accessible` on this View, deliberately. It would make the row a
          single accessibility element, and its children then stop being
          focusable at all: TalkBack would read "Browse by" once and a
          double-tap would fire at the row's centre rather than at a segment.
          GlassTabBar does the same thing -- role and label per control, no
          accessible container. */}
      <View
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        onLayout={(event: LayoutChangeEvent) => {
          const measuredRow = event.nativeEvent.layout.width;
          setRowWidth(measuredRow);
          // Placed here rather than left to the effect below. The effect runs
          // after the commit that mounts the pill, so a control whose value is
          // not the first option -- the reader header opens on the persisted
          // mode, which can be `mushaf` -- would paint one frame with the wash
          // under segment 0 and then jump. Setting the offset in the same
          // handler as the width means the pill's first frame is already right.
          const first = segmentWidth(measuredRow, options.length);
          if (applied.current === null && first > 0) place(pillOffset(index, first), false);
        }}
        style={{ flexDirection: 'row', gap: SEGMENT_GAP }}
      >
        {/* One wash that slides, rather than one per segment that fades. Behind
            the segments in paint order and pointerEvents="none", so it can
            never take a press meant for the tab it is sitting on.

            The wash's contrast figures assume it sits directly on the page, so
            nothing may paint behind this pill -- which is why the segments no
            longer carry a background of their own. */}
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width,
                borderRadius: radii.pill,
                backgroundColor: theme.accentWash,
              },
              pillStyle,
            ]}
          />
        ) : null}
        {options.map((option, optionIndex) => (
          <Segment
            key={option.value}
            option={option}
            selected={option.value === shown}
            // Re-selecting is a no-op, not a re-query: every caller reloads on
            // change, and a tab-mash would refetch 604 rows per tap.
            onPress={() => {
              if (option.value === shown) return;
              // Started here rather than left to the effect above, which runs
              // only after the commit that `onChange` causes. That commit
              // rebuilds the screen's list -- 604 surahs, the whole letter
              // index -- and the spring's opening frames were being spent
              // inside it, which is the stutter on Surahs and Dictionary.
              // Starting first puts the travel on the UI thread before React
              // re-renders at all; the effect then finds it already in place.
              const animate = applied.current !== null && !reduceMotion;
              if (width > 0) place(pillOffset(optionIndex, width), animate);
              if (pending.current) clearTimeout(pending.current);
              // Held until the pill lands. See PILL_SETTLE_MS for the frame
              // measurements; the short version is that the caller's re-render
              // mounts on the UI thread, which is the thread the spring is
              // travelling on, so doing both at once costs the travel a
              // 45-89ms hole. With no travel to protect there is nothing to
              // wait for, so reduced motion applies it straight away.
              if (!animate) {
                onChange(option.value);
                return;
              }
              setOptimistic(option.value);
              pending.current = setTimeout(() => {
                pending.current = null;
                onChange(option.value);
              }, PILL_SETTLE_MS);
            }}
          />
        ))}
      </View>
    </GlassSurface>
  );
}
