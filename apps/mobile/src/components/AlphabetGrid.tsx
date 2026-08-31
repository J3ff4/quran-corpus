import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data/mobile';

import { useGlassSkin } from './GlassSurface';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { usePressScaleStyle } from '@/motion/usePressScale';
import { fonts, radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';


export interface AlphabetGridProps {
  /** A prop rather than a store read, for the same reason SearchHeaderButton
   *  takes one: the component tests here mock the settings store without a
   *  uiLocale. */
  uiLocale: UiLocaleCode;
  /** The letters that actually have roots filed under them. Anything outside
   *  this set renders disabled: in the shipped DB ء is an empty bucket and it
   *  is the grid's first cell, so an enabled one makes the first thing a user
   *  taps in Browse a dead end that TalkBack still announces as a button. */
  available: ReadonlySet<string>;
  /** The letter Browse is currently filtering to, or null/undefined for none.
   *  The grid is a live filter now, not just a router to another screen -- with
   *  nothing marking the current letter the list silently disagrees with the
   *  grid. */
  activeLetter?: string | null;
  onSelect: (letter: string) => void;
}

function CellBase({
  letter,
  enabled,
  selected,
  onSelect,
}: {
  letter: string;
  enabled: boolean;
  selected: boolean;
  onSelect: (letter: string) => void;
}) {
  const theme = useThemeColors();
  const skin = useGlassSkin();
  const pressStyle = usePressScaleStyle();

  return (
    <Pressable
      testID="alphabet-cell"
      accessibilityRole="button"
      accessibilityLabel={letter}
      accessibilityState={{ disabled: !enabled, selected }}
      disabled={!enabled}
      onPress={enabled ? () => onSelect(letter) : undefined}
      style={(state) => [
        pressStyle(state),
        {
          // Ten across on a phone, and never eleven: at 8% of the row each,
          // ten tiles plus their gaps fit inside every width from a 360dp
          // screen up to a 412dp one, and an eleventh does not. flexGrow then
          // shares out what is left, so the tiles meet the gaps exactly rather
          // than leaving a ragged right edge.
          flexBasis: '8%',
          flexGrow: 1,
          // compact (40), not minimum (48), for the same reason
          // SegmentedControl takes it: 29 cells at 48 wide cannot be ten
          // across on a 390pt frame, and the grid at 48 was five rows tall --
          // it pushed the first result under the fold, which is what the
          // owner's D1 ruling was about. A cell is ~36 x 40, well clear of
          // WCAG 2.5.8's 24 x 24 AA floor, and the 5pt gaps keep the targets
          // from touching.
          height: touchTargets.compact,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radii.chip,
          borderWidth: 1,
          // The wash sits directly on the page, with the glass fill swapped
          // out rather than layered under it -- its measured 4.85:1 assumes
          // nothing is painting behind it.
          backgroundColor: selected ? theme.accentWash : skin.fill,
          borderColor: selected ? theme.accent : skin.border,
          // A letter no root is filed under. Contrast is exempt for an
          // inactive control (WCAG 1.4.3), and this reads as "not available"
          // at a glance in a way a colour swap alone does not.
          opacity: enabled ? 1 : 0.4,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? theme.accent : theme.text,
          fontFamily: fonts.arabic,
          fontSize: typography.body,
        }}
      >
        {letter}
      </Text>
    </Pressable>
  );
}

/** Memoized, and the reason the grid takes an `onSelect(letter)` rather than a
 *  per-cell closure: a letter tap changes `selected` on exactly two of the 29
 *  cells, and without this every one of them re-renders -- each an
 *  Animated.Pressable with a shared value behind it. */
const Cell = memo(CellBase);

/** The hijāʾī grid. Letters come from the shared order, so these buckets are
 *  the ones rootFirstLetter actually assigns. */
function AlphabetGridBase({ uiLocale, available, activeLetter, onSelect }: AlphabetGridProps) {
  return (
    <View
      accessibilityRole="list"
      // 29 sibling buttons whose only label is a bare letter; without a name on
      // the container a screen reader gives no clue what the group is.
      accessibilityLabel={t(uiLocale, 'dictionary.alphabet')}
      // RTL reading order: the alphabet starts at the top right.
      style={{
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
        gap: 5,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
      }}
    >
      {ARABIC_ALPHABET_ORDER.map((letter) => (
        <Cell
          key={letter}
          letter={letter}
          enabled={available.has(letter)}
          selected={letter === activeLetter}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

/** Memoized too: typing in the search box above re-renders the screen that
 *  holds this grid, and none of the four props change while it does. */
export const AlphabetGrid = memo(AlphabetGridBase);
