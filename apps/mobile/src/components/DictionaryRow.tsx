import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { router } from 'expo-router';

import { GlassSurface } from './GlassSurface';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { usePressScale } from '@/motion/usePressScale';
import { fonts, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface DictionaryRowProps {
  arabic: string;
  /** A verb row's lemma, or null. Arabic, so it takes the Uthmani face. */
  gloss?: string | null;
  count: number;
  /** 1-based position in a ranked list. Omitted on Browse, which is not ranked. */
  rank?: number;
  /** The Buckwalter spelling, shown in Browse's middle column. Omitted on the
   *  ranked pane, whose middle column is the count. */
  translit?: string;
  href: string;
  uiLocale: UiLocaleCode;
}

/** One dictionary row, as a glass card: a number in the gutter, a mono middle
 *  column, and the Arabic on the right.
 *
 *  Shared by Browse and the Frequent pane, which differ only in what those two
 *  left columns carry -- Browse leads with the occurrence count and puts the
 *  transliteration beside it, the ranked pane leads with the rank and puts the
 *  count there. Both mockups (m6g-1 and m6g-2) draw the same three columns.
 *
 *  Flat glass, not a plate: the ranked pane renders up to FREQUENCY_LIMIT
 *  (1000) of these and Browse 1642, and a drop shadow per row at that count is
 *  a scroll the owner can feel. The shadow is for plates and docked bars.
 *
 *  Not a Link: the row is a three-column layout and expo-router's Link renders
 *  a Text on native, inside which a flexDirection View does not lay out --
 *  same reason FrequencyList gives. */
export function DictionaryRow({
  arabic,
  gloss,
  count,
  rank,
  translit,
  href,
  uiLocale,
}: DictionaryRowProps) {
  const theme = useThemeColors();
  const press = usePressScale();
  const ranked = rank !== undefined;

  return (
    <AnimatedPressable
      testID="dictionary-row"
      accessibilityRole="link"
      // Without a name the row announces as the bare concatenation of its
      // children, with nothing to say the trailing number is a count.
      accessibilityLabel={`${arabic}${gloss ? ` ${gloss}` : ''}, ${count} ${t(uiLocale, 'dictionary.occurrences')}`}
      onPress={() => router.push(href)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[press.style, { marginHorizontal: 16, marginBottom: 8 }]}
    >
      <GlassSurface
        style={{
          shadowOpacity: 0,
          elevation: 0,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 10,
          minHeight: touchTargets.minimum + 6,
          gap: 12,
        }}
      >
        <Text
          testID={ranked ? 'dictionary-rank' : undefined}
          style={{
            minWidth: 34,
            color: theme.mutedText,
            fontVariant: ['tabular-nums'],
            fontSize: typography.caption,
          }}
        >
          {ranked ? rank : count}
        </Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{
              color: theme.mutedText,
              fontVariant: ['tabular-nums'],
              fontSize: typography.caption,
            }}
          >
            {ranked ? count : (translit ?? '')}
          </Text>
          {gloss ? (
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: theme.mutedText,
                fontFamily: fonts.arabic,
                fontSize: typography.body,
                writingDirection: 'rtl',
              }}
            >
              {gloss}
            </Text>
          ) : null}
        </View>
        <Text
          style={{
            color: theme.text,
            fontFamily: fonts.arabic,
            fontSize: 25,
            writingDirection: 'rtl',
          }}
        >
          {arabic}
        </Text>
      </GlassSurface>
    </AnimatedPressable>
  );
}
