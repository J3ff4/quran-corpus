import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { GlassSurface } from './GlassSurface';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { fonts, typography } from '@/theme/tokens';
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
  /** Previous/Next, drawn over the headword's own row so the two chevrons
   *  flank it (owner ruling D3). An overlay rather than a sibling because the
   *  pager is a labelled toolbar of exactly two buttons, and threading the
   *  heading between them would put a heading inside a toolbar. Optional: a
   *  screen with nothing to page to passes nothing. */
  pager?: ReactNode;
  /** Corpus-wide occurrences. */
  count: number;
  /** A prop, not a store read: the component tests mock the settings store
   *  without a uiLocale, same as AlphabetGrid and SearchHeaderButton. */
  uiLocale: UiLocaleCode;
}

/** Clearance either side of the headword for the pager's chevrons: the button
 *  (34) plus the gap the mockup leaves it. Nothing centres the headword
 *  against the buttons, so this is what keeps a long lemma from running
 *  underneath one. */
const PAGER_GUTTER = 46;

/** Shared entry plate for both dictionary entry screens.
 *
 *  Centred stack on glass, matching web: the reading of the word sat visually
 *  below its own footnotes when translit, grammar and count competed on one
 *  line. */
export function EntryHeader({
  arabic,
  transliteration,
  children,
  pager,
  count,
  uiLocale,
}: EntryHeaderProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  return (
    <GlassSurface radius="pill" style={{ alignItems: 'center', gap: 8, padding: 20 }}>
      <View style={{ alignSelf: 'stretch', justifyContent: 'center' }}>
        <Text
          // 'heading' (ARIA-aligned), not the legacy accessibilityRole="header":
          // the latter lands as role="header" (the banner landmark), not the
          // "heading" role a screen reader needs to announce this as one --
          // see LanguageSheet.test.tsx's note on the same distinction.
          role="heading"
          style={{
            color: theme.text,
            fontFamily: fonts.arabic,
            fontSize: sizes.title,
            textAlign: 'center',
            paddingHorizontal: pager ? PAGER_GUTTER : 0,
            // writingDirection is iOS-only (see AyahText); Android resolves
            // direction from the content.
            writingDirection: 'rtl',
          }}
        >
          {arabic}
        </Text>
        {pager ? (
          <View
            // box-none, not none: the chevrons themselves must stay tappable,
            // and everything between them must not swallow a press meant for
            // the headword's own row.
            pointerEvents="box-none"
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' }}
          >
            {pager}
          </View>
        ) : null}
      </View>
      {transliteration ? (
        <Text
          testID="entry-translit"
          style={{ color: theme.mutedText, fontFamily: fonts.display, fontSize: typography.body }}
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
        style={{ color: theme.accent, fontSize: typography.caption, fontWeight: '600' }}
      >
        {count} {t(uiLocale, 'dictionary.occurrences')}
      </Text>
    </GlassSurface>
  );
}
