import { useMemo } from 'react';
import { FlatList, Pressable, SectionList, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassSurface } from './GlassSurface';
import { Icon } from './icons/Icon';
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
  /** Present makes the row a disclosure: it draws a chevron and announces its
   *  state. The row still owns what pressing it does -- BrowseList never
   *  toggles anything itself, because the open set belongs to the screen. */
  expanded?: boolean;
  /** A child of a disclosure row: inset, and no medallion of its own. */
  indent?: boolean;
  onPress: () => void;
}

export interface BrowseSection {
  title: string;
  data: BrowseItem[];
  /** How many rows sit behind the header, which a collapsed one cannot
   *  otherwise say. */
  count?: number;
  /** Together these make the header a disclosure button. `false` renders the
   *  section with no rows -- emptied in this component rather than at the call
   *  site, so a collapsed section cannot lose the header that reopens it. */
  expanded?: boolean;
  onToggle?: () => void;
}

function Row({ item }: { item: BrowseItem }) {
  const theme = useThemeColors();
  const press = usePressScale();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={item.accessibilityLabel}
      // Only on a disclosure. A surah row navigates, and announcing that as
      // collapsed promises a disclosure that is not there.
      {...(item.expanded === undefined ? {} : { accessibilityState: { expanded: item.expanded } })}
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
        {item.indent ? (
          // No medallion on a child: the number belongs to the juz above it,
          // and repeating it under every range reads as four juz.
          <View style={{ width: 34 }} />
        ) : (
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
        )}
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
        {item.expanded === undefined ? null : (
          <Icon
            testID={`browse-chevron-${item.key}-${item.expanded ? 'chevronDown' : 'chevronRight'}`}
            name={item.expanded ? 'chevronDown' : 'chevronRight'}
            color={theme.mutedText}
            size={18}
          />
        )}
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
    // Emptied here, not at the call site: a screen that filtered its own rows
    // would have to remember to keep the header, and a section that loses its
    // header can never be reopened.
    const rendered = sections.map((section) =>
      section.expanded === false ? { ...section, data: [] } : section,
    );

    return (
      <SectionList
        sections={rendered}
        renderItem={({ item }) => <Row item={item} />}
        renderSectionHeader={({ section }) => {
          const label = (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingTop: 14,
                paddingBottom: 6,
              }}
            >
              {section.onToggle ? (
                <Icon
                  name={section.expanded === false ? 'chevronRight' : 'chevronDown'}
                  color={theme.mutedText}
                  size={16}
                />
              ) : null}
              <Text
                accessibilityRole="header"
                style={{
                  flex: 1,
                  color: theme.mutedText,
                  fontFamily: fonts.displaySemiBold,
                  fontSize: typography.caption,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {section.title}
              </Text>
              {section.count === undefined ? null : (
                <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
                  {String(section.count)}
                </Text>
              )}
            </View>
          );

          if (!section.onToggle) return label;
          return (
            <Pressable
              testID={`browse-section-${section.title}`}
              accessibilityRole="button"
              // The count is a non-focusable child of this button, so a screen
              // reader announces the label and never reaches it. Appending the
              // bare number rather than "86 surahs" keeps the announcement
              // equal to what is on screen and needs no per-locale noun.
              accessibilityLabel={
                section.count === undefined ? section.title : `${section.title}, ${section.count}`
              }
              accessibilityState={{ expanded: section.expanded !== false }}
              onPress={section.onToggle}
              // The 48dp floor is what makes a strip of small caps a thumb
              // target rather than a 26dp line.
              style={{ minHeight: touchTargets.minimum, justifyContent: 'center' }}
            >
              {label}
            </Pressable>
          );
        }}
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
