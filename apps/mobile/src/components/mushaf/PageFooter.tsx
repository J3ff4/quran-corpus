import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MEDALLION_OUTLINE_PATH, MEDALLION_VIEW_BOX } from '@quran-corpus/config/ornaments/medallion';

import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useThemeColors } from '@/theme/themeContext';

const MEDALLION_SIZE = 34;

export interface PageFooterProps {
  page: number;
  juz: number;
  uiLocale: UiLocaleCode;
}

/**
 * The page's own foot: its number in an ornament, with the juz beside it.
 *
 * The ornament is `medallion-1` -- the ayah rosette -- as a deliberate
 * STAND-IN (ruling 23, re-confirmed 2026-09-08). A mushaf page number carries
 * its own frame in print and this is not it; the PR body says so, so that a
 * reviewer does not read it as the finished art.
 */
export function PageFooter({ page, juz, uiLocale }: PageFooterProps) {
  const theme = useThemeColors();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <Text style={{ color: theme.mutedText, fontSize: 12 }}>
        {`${t(uiLocale, 'browse.juzLabel')} ${juz}`}
      </Text>
      <View
        accessible
        accessibilityLabel={`${t(uiLocale, 'browse.pageLabel')} ${page}`}
        style={{
          width: MEDALLION_SIZE,
          height: MEDALLION_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg
          width={MEDALLION_SIZE}
          height={MEDALLION_SIZE}
          viewBox={MEDALLION_VIEW_BOX}
          style={{ position: 'absolute' }}
        >
          <Path
            d={MEDALLION_OUTLINE_PATH}
            fill="none"
            stroke={theme.mutedText}
            strokeWidth={4}
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={{ color: theme.mutedText, fontSize: 12, fontVariant: ['tabular-nums'] }}>
          {page}
        </Text>
      </View>
    </View>
  );
}
