import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassSurface } from './GlassSurface';
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
          // The wash's contrast figures assume it sits directly on the page,
          // so nothing may paint behind this segment.
          backgroundColor: selected ? theme.accentWash : 'transparent',
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
  return (
    <GlassSurface radius="pill" style={{ padding: 4 }}>
      {/* The label lives here rather than on each option: four segments each
          announcing "Browse by" is four swipes of the same words. */}
      <View
        accessible
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        style={{ flexDirection: 'row', gap: 4 }}
      >
        {options.map((option) => (
          <Segment
            key={option.value}
            option={option}
            selected={option.value === value}
            // Re-selecting is a no-op, not a re-query: every caller reloads on
            // change, and a tab-mash would refetch 604 rows per tap.
            onPress={() => {
              if (option.value !== value) onChange(option.value);
            }}
          />
        ))}
      </View>
    </GlassSurface>
  );
}
