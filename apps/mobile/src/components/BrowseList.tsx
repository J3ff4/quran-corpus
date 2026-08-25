import { useMemo } from 'react';
import { FlatList, Pressable, SectionList, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassSurface } from './GlassSurface';
import { usePressScale } from '@/motion/usePressScale';
import { fonts, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface BrowseItem {
  /** Unique within its own mode. Modes are never mixed in one list, but the
   *  key is prefixed anyway so switching modes cannot recycle a row. */
  key: string;
  /** The number in the leading medallion: a surah id, a juz, a page, a rank. */
  leading: string;
  title: string;
  subtitle?: string;
  /** Rendered right-aligned in the Arabic face when present. */
  arabic?: string;
  /** Says what the row opens. A bare number announces as a number. */
  accessibilityLabel: string;
  testID?: string;
  onPress: () => void;
}

export interface BrowseSection {
  title: string;
  data: BrowseItem[];
}

function Row({ item }: { item: BrowseItem }) {
  const theme = useThemeColors();
  const press = usePressScale();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={item.accessibilityLabel}
      onPress={item.onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.style}
      {...(item.testID ? { testID: item.testID } : {})}
    >
      <GlassSurface
        style={{
          minHeight: touchTargets.minimum + 20,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <Text
          style={{
            color: theme.accent,
            fontFamily: fonts.displaySemiBold,
            fontSize: typography.body,
            minWidth: 34,
            textAlign: 'center',
          }}
        >
          {item.leading}
        </Text>
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text numberOfLines={1} style={{ color: theme.mutedText, fontSize: typography.caption }}>
              {item.subtitle}
            </Text>
          ) : null}
        </View>
        {item.arabic ? (
          <Text style={{ color: theme.text, fontFamily: fonts.arabic, fontSize: 26, textAlign: 'right' }}>
            {item.arabic}
          </Text>
        ) : null}
      </GlassSurface>
    </AnimatedPressable>
  );
}

export interface BrowseListProps {
  /** Exactly one of these. Sections drive a SectionList, items a FlatList. */
  items?: BrowseItem[];
  sections?: BrowseSection[];
}

/**
 * The glass row list behind every browse mode, and behind the surah index.
 *
 * One component rather than four: the modes differ only in what goes in the
 * medallion and the two text slots, and four near-identical FlatLists is where
 * a row gains a fix in one mode and keeps the bug in the other three.
 *
 * Rows are separated by a gap rather than a hairline -- they are cards now, and
 * a divider between two bordered cards reads as a third border.
 */
export function BrowseList({ items, sections }: BrowseListProps) {
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
  const contentContainerStyle = useMemo(
    () => ({ paddingHorizontal: 16, paddingTop: 8, paddingBottom, gap: 10 }),
    [paddingBottom],
  );

  if (sections) {
    return (
      <SectionList
        sections={sections}
        renderItem={({ item }) => <Row item={item} />}
        renderSectionHeader={({ section }) => (
          <Text
            accessibilityRole="header"
            style={{
              color: theme.mutedText,
              fontFamily: fonts.displaySemiBold,
              fontSize: typography.caption,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              paddingTop: 14,
              paddingBottom: 6,
            }}
          >
            {section.title}
          </Text>
        )}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={contentContainerStyle}
      />
    );
  }

  return (
    <FlatList
      data={items ?? []}
      renderItem={({ item }) => <Row item={item} />}
      keyExtractor={(item) => item.key}
      contentContainerStyle={contentContainerStyle}
    />
  );
}
