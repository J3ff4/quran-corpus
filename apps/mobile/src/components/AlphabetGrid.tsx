import { Pressable, Text, View } from 'react-native';
import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
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
  onSelect: (letter: string) => void;
}

/** The hijāʾī grid. Letters come from the shared order, so these buckets are
 *  the ones rootFirstLetter actually assigns. */
export function AlphabetGrid({ uiLocale, available, onSelect }: AlphabetGridProps) {
  const theme = useThemeColors();

  return (
    <View
      accessibilityRole="list"
      // 29 sibling buttons whose only label is a bare letter; without a name on
      // the container a screen reader gives no clue what the group is.
      accessibilityLabel={t(uiLocale, 'dictionary.alphabet')}
      // RTL reading order: the alphabet starts at the top right.
      style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, padding: 16 }}
    >
      {ARABIC_ALPHABET_ORDER.map((letter) => {
        const enabled = available.has(letter);
        return (
          <Pressable
            key={letter}
            testID="alphabet-cell"
            accessibilityRole="button"
            accessibilityLabel={letter}
            accessibilityState={{ disabled: !enabled }}
            disabled={!enabled}
            onPress={enabled ? () => onSelect(letter) : undefined}
            style={{
              minWidth: touchTargets.minimum,
              minHeight: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text
              style={{
                color: enabled ? theme.text : theme.mutedText,
                fontFamily: 'Hafs',
                fontSize: typography.body,
              }}
            >
              {letter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
