import { Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MEDALLION_OUTLINE_PATH, MEDALLION_VIEW_BOX } from '@quran-corpus/config/ornaments/medallion';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useThemeColors } from '@/theme/themeContext';

/**
 * Ayah-marker rosette: the traditional mushaf 8-point notched star with the
 * verse number inside. Ported from web's ornament so both products draw the
 * same marker; the source art's cream fill and dark stroke are replaced by
 * theme tokens, per CLAUDE.md §8.
 */
const SIZE = 28;

export function AyahMedallion({ n, uiLocale }: { n: number; uiLocale: UiLocaleCode }) {
  const theme = useThemeColors();
  const { fontScale } = useWindowDimensions();
  // Scales with the user's system font size so a three-digit ayah number
  // (Al-Baqarah runs to 286) doesn't wrap and clip inside a fixed box. See
  // apps/mobile/src/settings/settingsStore.tsx ~line 35: there is no in-app
  // font-scale control precisely because the system setting already does
  // this for every <Text>, so the box has to follow it too.
  const box = SIZE * fontScale;
  // Three digits still touch the rosette border at maximum system font size --
  // observed on device, build 49e4a81f. Growing the box instead would push the
  // marker into the ayah text, and the notched star has no flat side to grow
  // into, so the number is what gives way. Al-Baqarah runs to 286, so 3 digits
  // is the widest case there is.
  const fontSize = Math.round(SIZE * 0.38 * (n >= 100 ? 0.9 : 1));

  return (
    <View
      accessible
      accessibilityRole="image"
      // Localized, not a bare `Ayah ${n}`: this label replaced a loose digit
      // that TalkBack read in the user's own language, so hardcoding English
      // here would be a regression for the uz and ru locales specifically.
      accessibilityLabel={`${t(uiLocale, 'reader.ayahLabel')} ${n}`}
      style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg
        width={box}
        height={box}
        viewBox={MEDALLION_VIEW_BOX}
        style={{ position: 'absolute' }}
      >
        {/* No backing fill as of M6d. It existed to seat the rosette on the
            page colour; on a glass card that same fill paints an opaque patch
            over the surface the card is meant to show through, and the mockups
            draw the marker as outline only. */}
        <Path
          d={MEDALLION_OUTLINE_PATH}
          fill="none"
          stroke={theme.mutedText}
          strokeWidth={4}
          strokeLinejoin="round"
        />
      </Svg>
      <Text
        style={{
          color: theme.mutedText,
          fontSize,
          fontVariant: ['tabular-nums'],
        }}
      >
        {n}
      </Text>
    </View>
  );
}
