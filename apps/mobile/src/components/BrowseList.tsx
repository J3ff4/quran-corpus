import { useEffect, useMemo } from 'react';
import { FlatList, Pressable, SectionList, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Collapsible } from './Collapsible';
import { GlassSurface } from './GlassSurface';
import { Icon } from './icons/Icon';
import { usePressScaleStyle } from '@/motion/usePressScale';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { fonts, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';


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
  /** Which face the `arabic` slot is drawn in.
   *
   *  'surahName' is the calligraphic V4 face, whose glyphs live in a private
   *  use area -- it has NO glyph for ordinary Arabic text, so a row passing a
   *  real Arabic string with this face renders tofu. Only pass it with the
   *  output of `surahNameGlyph` (ruling S1). Absent = the reading face, which
   *  is what juz, page and revealed rows want. */
  arabicFace?: 'reading' | 'surahName';
  /** Says what the row opens. A bare number announces as a number. */
  accessibilityLabel: string;
  testID?: string;
  /** Present makes the row a disclosure: it draws a chevron and announces its
   *  state. The row still owns what pressing it does -- BrowseList never
   *  toggles anything itself, because the open set belongs to the screen. */
  expanded?: boolean;
  /** Rows that belong to this one, drawn inside its own card while
   *  `expanded`. Not siblings in the list: a child card looked exactly like a
   *  juz card, so an expanded juz read as four juz (owner ruling R6, device
   *  screenshot 2026-09-11). Always build them -- the curtain measures them to
   *  know how far to unroll, and children gated on `expanded` make every open
   *  a drop from 0 to 0. */
  children?: BrowseItem[];
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

/** How long the chevron takes to turn. The curtain beside it is UNROLL_MS;
 *  the two are one motion and must not read as two. */
const SPIN_MS = 220;

/**
 * The disclosure chevron, turning between shut and open.
 *
 * A component of its own, mounted ONLY by a disclosure row, because it is the
 * one thing here that builds reanimated nodes. Held inline in `Row` it built a
 * shared value and an animated style for every row in the list -- 114 surahs,
 * 604 pages, none of which draw a chevron at all -- on the Fabric commit that
 * mounts them, which is the UI thread. That is precisely the cost
 * `usePressScaleStyle` exists to avoid: 450ms in one uninterrupted block on a
 * Surahs mode switch (device, 2026-08-31), and the block that froze the tab
 * pill mid-travel in PR #48.
 */
function DisclosureChevron({ expanded, testID }: { expanded: boolean; testID: string }) {
  const theme = useThemeColors();
  const reduceMotion = useReducedMotion();
  const spin = useSharedValue(expanded ? 90 : 0);

  useEffect(() => {
    const target = expanded ? 90 : 0;
    spin.value = reduceMotion ? target : withTiming(target, { duration: SPIN_MS });
  }, [expanded, reduceMotion, spin]);

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  return (
    <Animated.View testID={testID} style={spinStyle}>
      <Icon name="chevronRight" color={theme.mutedText} size={18} />
    </Animated.View>
  );
}

function Row({ item }: { item: BrowseItem }) {
  const theme = useThemeColors();
  const pressStyle = usePressScaleStyle();

  return (
    // The surface is outside the header Pressable now, not inside it: the
    // children live in this same card, and a card wrapped in the disclosure's
    // own Pressable would swallow every child tap as a toggle.
    <GlassSurface>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.accessibilityLabel}
        // Only on a disclosure. A surah row navigates, and announcing that as
        // collapsed promises a disclosure that is not there.
        {...(item.expanded === undefined ? {} : { accessibilityState: { expanded: item.expanded } })}
        onPress={item.onPress}
        style={pressStyle}
        {...(item.testID ? { testID: item.testID } : {})}
      >
        <View
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
            <Text
              testID={`browse-arabic-${item.key}`}
              style={{
                color: theme.text,
                // V4 (`surahNameAlt`), never V2: V2 has no glyph for surah 102
                // and would draw a box on At-Takathur. V4 covers all 114 --
                // verified 2026-09-11 during the M7e font spike. Do not
                // "simplify" this to the mushaf band's face.
                fontFamily: item.arabicFace === 'surahName' ? fonts.surahNameAlt : fonts.arabic,
                // The calligraphic glyph carries its own side bearings and a
                // tail below the baseline, so it needs more box than a 26pt
                // reading run before it clips.
                fontSize: item.arabicFace === 'surahName' ? 30 : 26,
                textAlign: 'right',
              }}
            >
              {item.arabic}
            </Text>
          ) : null}
          {/* One glyph that turns, not two that swap. The chevron rotating in
              step with the curtain is what says this card opened, rather than
              that unrelated rows arrived beneath it. Mounted only on a
              disclosure -- see the note on the component. */}
          {item.expanded === undefined ? null : (
            <DisclosureChevron expanded={item.expanded} testID={`browse-chevron-${item.key}`} />
          )}
        </View>
      </Pressable>
      {item.children ? (
        <Collapsible open={item.expanded === true}>
          {item.children.map((child, index) => (
            <View key={child.key}>
              {/* Inset to the child text's own left edge, so it reads as a rule
                  between two rows of one card rather than as the card's edge --
                  the same rule the word sheet's group divider follows. */}
              {index === 0 ? null : (
                <View style={{ height: 1, marginLeft: 48, backgroundColor: theme.border }} />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={child.accessibilityLabel}
                onPress={child.onPress}
                {...(child.testID ? { testID: child.testID } : {})}
                // Two-tier feedback, deliberately: the card's own surface sits
                // outside every Pressable in here (it has to -- see above), so
                // what squeezes on a press is the row's content rather than
                // the card. A child with no squeeze at all read as dead.
                style={(state) => [
                  pressStyle(state),
                  {
                    minHeight: touchTargets.minimum,
                    justifyContent: 'center',
                    paddingLeft: 48,
                    paddingRight: 16,
                  },
                ]}
              >
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: typography.body }}>
                  {child.title}
                </Text>
              </Pressable>
            </View>
          ))}
        </Collapsible>
      ) : null}
    </GlassSurface>
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
