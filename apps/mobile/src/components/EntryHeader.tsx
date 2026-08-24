import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

export interface EntryHeaderProps {
  /** The headword: a lemma's Arabic form, or a root's letters. */
  arabic: string;
  /** Latin reading, under the headword. Roots have none -- `roots` carries no
   *  transliteration column, and the letter pills spell the consonants out. */
  transliteration?: string | null;
  /** The row between the transliteration and the count: sense chips on the
   *  lemma screen, letter pills on the root screen. Callers pass nothing rather
   *  than an empty fragment, so the row and its gap collapse together. */
  children?: ReactNode;
  /** Corpus-wide occurrences. */
  count: number;
  /** A prop, not a store read: the component tests mock the settings store
   *  without a uiLocale, same as AlphabetGrid and SearchHeaderButton. */
  uiLocale: UiLocaleCode;
}

/** Shared masthead for both dictionary entry screens.
 *
 *  Centred stack, matching web: the reading of the word sat visually below its
 *  own footnotes when translit, grammar and count competed on one line. */
export function EntryHeader({
  arabic,
  transliteration,
  children,
  count,
  uiLocale,
}: EntryHeaderProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Text
        // 'heading' (ARIA-aligned), not the legacy accessibilityRole="header":
        // the latter lands as role="header" (the banner landmark), not the
        // "heading" role a screen reader needs to announce this as one --
        // see LanguageSheet.test.tsx's note on the same distinction.
        role="heading"
        style={{
          color: theme.text,
          fontFamily: 'Hafs',
          fontSize: sizes.title,
          textAlign: 'center',
          // writingDirection is iOS-only (see AyahText); Android resolves
          // direction from the content.
          writingDirection: 'rtl',
        }}
      >
        {arabic}
      </Text>
      {transliteration ? (
        <Text
          testID="entry-translit"
          style={{ color: theme.mutedText, fontSize: typography.body }}
        >
          {transliteration}
        </Text>
      ) : null}
      {children ? (
        <View
          testID="entry-chips"
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {children}
        </View>
      ) : null}
      {/* t() has no interpolation, hence the concatenation -- same shape
          FrequencyList's row label uses. */}
      <Text
        testID="entry-count"
        style={{ color: theme.mutedText, fontSize: typography.caption }}
      >
        {count} {t(uiLocale, 'dictionary.occurrences')}
      </Text>
    </View>
  );
}
