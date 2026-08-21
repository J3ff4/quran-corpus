import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface DictionaryRowProps {
  arabic: string;
  /** A verb row's lemma, or null. Arabic, so it takes the Uthmani face. */
  gloss?: string | null;
  count: number;
  /** 1-based position in a ranked list. Omitted on Browse, which is not ranked. */
  rank?: number;
  href: string;
  uiLocale: UiLocaleCode;
}

/** One dictionary row: optional rank, Arabic root/lemma, optional gloss, count.
 *  Shared by Browse and the Frequent pane (Task 10) -- the row differs only in
 *  whether it carries a rank and a gloss.
 *
 *  Not a Link: the row is a three-column layout and expo-router's Link renders
 *  a Text on native, inside which a flexDirection View does not lay out --
 *  same reason FrequencyList gives. */
export function DictionaryRow({ arabic, gloss, count, rank, href, uiLocale }: DictionaryRowProps) {
  const theme = useThemeColors();

  return (
    <Pressable
      testID="dictionary-row"
      accessibilityRole="link"
      // Without a name the row announces as the bare concatenation of its
      // children, with nothing to say the trailing number is a count.
      accessibilityLabel={`${arabic}${gloss ? ` ${gloss}` : ''}, ${count} ${t(uiLocale, 'dictionary.occurrences')}`}
      onPress={() => router.push(href)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        minHeight: touchTargets.minimum,
        gap: 12,
      }}
    >
      {rank !== undefined ? (
        <Text
          testID="dictionary-rank"
          style={{ width: 32, color: theme.mutedText, fontVariant: ['tabular-nums'], fontSize: typography.body }}
        >
          {rank}
        </Text>
      ) : null}
      <View
        style={{
          flex: 1,
          flexDirection: 'row-reverse',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Text
          style={{
            color: theme.text,
            fontFamily: 'Hafs',
            fontSize: typography.body,
            writingDirection: 'rtl',
          }}
        >
          {arabic}
        </Text>
        {gloss ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.mutedText,
              flex: 1,
              fontFamily: 'Hafs',
              fontSize: typography.body,
              writingDirection: 'rtl',
            }}
          >
            {gloss}
          </Text>
        ) : null}
        <Text style={{ color: theme.mutedText }}>{count}</Text>
      </View>
    </Pressable>
  );
}
