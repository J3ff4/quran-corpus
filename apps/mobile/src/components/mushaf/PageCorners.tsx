import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MEDALLION_OUTLINE_PATH, MEDALLION_VIEW_BOX } from '@quran-corpus/config/ornaments/medallion';

import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const MEDALLION_SIZE = 34;

export interface PageCornersProps {
  page: number;
  juz: number;
  /** The surah the page opens with, transliterated. Print names that one even
   *  where the page goes on to head another. */
  surahName: string;
  uiLocale: UiLocaleCode;
}

/**
 * A page's own furniture: juz, surah name and page number, printed on the page
 * rather than hung on the chrome.
 *
 * On the page deliberately (M7d ruling 9). The chrome hides itself on a timer,
 * and a reader who has hidden it is exactly the reader who needs to know where
 * they are -- furniture that went away with the chrome would be furniture that
 * is absent whenever it matters.
 *
 * **Odd pages carry their number on the right, even pages on the left**
 * (ruling 8). That is the outer edge of the leaf in a bound mushaf: odd pages
 * are rectos. The app shows one page at a time, so the alternation is the only
 * thing left of the spread -- and it is what a reader's thumb learns.
 */
export function PageCorners({ page, juz, surahName, uiLocale }: PageCornersProps) {
  const theme = useThemeColors();
  const numberOnRight = page % 2 === 1;

  return (
    // pointerEvents none throughout: the furniture sits over the text block,
    // and a label that swallowed a long press would make the words under it
    // unopenable.
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <View
        style={{
          position: 'absolute',
          top: 6,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          testID="page-surah-name"
          numberOfLines={1}
          accessibilityLabel={surahName}
          style={{ color: theme.mutedText, fontSize: typography.caption, flexShrink: 1 }}
        >
          {surahName}
        </Text>
        <Text
          testID="page-juz"
          accessibilityLabel={`${t(uiLocale, 'browse.juzLabel')} ${juz}`}
          style={{ color: theme.mutedText, fontSize: typography.caption }}
        >
          {`${t(uiLocale, 'browse.juzLabel')} ${juz}`}
        </Text>
      </View>

      <View
        testID="page-number"
        accessible
        accessibilityLabel={`${t(uiLocale, 'browse.pageLabel')} ${page}`}
        style={{
          position: 'absolute',
          bottom: 4,
          ...(numberOnRight ? { right: 16 } : { left: 16 }),
          width: MEDALLION_SIZE,
          height: MEDALLION_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* medallion-1, the ayah rosette, still a deliberate STAND-IN: a
            printed page number carries its own frame and this is not it
            (ruling 23, carried over from M7c). */}
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
