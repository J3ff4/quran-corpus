import { Text, View } from 'react-native';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

import type { Gloss } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';

import { GlossLangTag } from './GlossLangTag';

/** One gloss, under the span of words it covers. Extracted so WbwSpan says
 *  what it is about -- the merge -- and this says what a shared gloss looks
 *  like, which is the part the two densities disagree on. */
export function WbwSpanGloss({
  gloss,
  uiLocale,
  glossLines = 2,
}: {
  gloss: Gloss | null;
  uiLocale: UiLocaleCode;
  glossLines?: number;
}) {
  const theme = useThemeColors();
  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        testID="wbw-span-gloss"
        numberOfLines={glossLines}
        style={{ color: theme.text, fontSize: typography.caption - 1, textAlign: 'center' }}
      >
        {gloss?.text ?? ''}
      </Text>
      <GlossLangTag gloss={gloss} uiLocale={uiLocale} fontSize={typography.caption - 3} />
    </View>
  );
}
