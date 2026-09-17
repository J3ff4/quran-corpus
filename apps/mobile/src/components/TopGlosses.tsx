import { Text, View } from 'react-native';
import { InfoButton } from '@/components/InfoSheet';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { fonts, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface TopGlossesProps {
  /** Commonest first. Empty renders nothing -- see the note in the docstring. */
  glosses: readonly string[];
  uiLocale: UiLocaleCode;
  /** The sheet's open state, for the button's aria-expanded. The sheet itself
   *  is the screen's, not this block's: BottomSheet fills its parent, and this
   *  block is a few lines inside a list header. */
  infoOpen: boolean;
  onInfo: () => void;
  testID?: string;
}

/**
 * A word's or root's commonest word-by-word glosses, captioned and qualified.
 *
 * Contextual translations, not definitions -- the commonest gloss for a word
 * can be a whole clause. Unlabelled these read as the entry's meaning, which
 * is why the caption and the info button are not optional decoration: on the
 * root screen the block sits directly above a Lane / Hans Wehr article, and
 * the contrast between the two is the entire reason it is captioned.
 *
 * Shared by the lemma and root screens. It was the lemma screen's alone until
 * the root screen needed the same three elements in the same order; a second
 * copy would have been two places for the caveat to drift, and the caveat is
 * the point (§3).
 *
 * Renders nothing for an empty list rather than an empty caption: every
 * language without a word-by-word set returns none, which today is everything
 * but Uzbek.
 */
export function TopGlosses({ glosses, uiLocale, infoOpen, onInfo, testID }: TopGlossesProps) {
  const theme = useThemeColors();

  if (glosses.length === 0) return null;

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text
          style={{
            color: theme.mutedText,
            fontFamily: fonts.displaySemiBold,
            fontSize: typography.caption,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {t(uiLocale, 'lemma.translatedAs')}
        </Text>
        <InfoButton
          label={t(uiLocale, 'lemma.aboutTranslations')}
          expanded={infoOpen}
          onPress={onInfo}
        />
      </View>
      <Text testID={testID} style={{ color: theme.text, fontSize: typography.body }}>
        {glosses.join(' · ')}
      </Text>
    </View>
  );
}
