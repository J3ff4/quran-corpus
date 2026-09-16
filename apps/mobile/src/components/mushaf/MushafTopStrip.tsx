import { Text, View } from 'react-native';

import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/**
 * How much the strip draws BELOW the status bar's inset: the row that names
 * the page.
 *
 * Exported because two other things have to clear it -- the chrome card docks
 * under it, and the page no longer reserves a header strip of its own.
 */
export const STRIP_ROW_HEIGHT = 26;

export interface MushafTopStripProps {
  /** The status bar's stable inset. Held, never read live: hiding the bar
   *  collapses it to 0 and the strip would shrink out from under the page. */
  insetTop: number;
  /** The surah the page in view opens with, transliterated. */
  surahName: string;
  /** 0 before the index resolves, and then the row prints nothing. */
  juz: number;
  uiLocale: UiLocaleCode;
}

/**
 * The band above the page: the paper colour, and the page's own identity on it.
 *
 * It exists because the tabs layout pads every scene clear of the status bar,
 * and on this tab that padding showed the app's bloom -- a green strip across
 * the top of a printed leaf (owner, 2026-09-15). Painted in the page's own
 * ground there is no seam at all.
 *
 * The surah and the juz moved up here from the page's corners in the same
 * change. They were costing the leaf a 26dp header strip to say what the space
 * above it was saying nothing with. The page number still holds a bottom
 * corner, which is the alternation a thumb learns (M7d ruling 8).
 */
export function MushafTopStrip({ insetTop, surahName, juz, uiLocale }: MushafTopStripProps) {
  const theme = useThemeColors();

  return (
    <View
      testID="mushaf-top-strip"
      // Nothing here takes a touch: the chrome card docks under it and the tap
      // that brings the chrome back belongs to the page.
      pointerEvents="none"
      style={{ paddingTop: insetTop, backgroundColor: theme.background }}
    >
      <View
        style={{
          height: STRIP_ROW_HEIGHT,
          paddingHorizontal: 16,
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
          {juz > 0 ? `${t(uiLocale, 'browse.juzLabel')} ${juz}` : ''}
        </Text>
      </View>
    </View>
  );
}
