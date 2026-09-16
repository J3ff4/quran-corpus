import { Pressable, Text, View } from 'react-native';

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
  /** A tap on the band toggles the chrome, exactly as a tap on the leaf does.
   *  The row this strip took over used to be inside the page's own Pressable,
   *  so without this the top of the screen becomes a dead zone -- and with the
   *  chrome down, a dead zone is a place the chrome cannot be brought back
   *  from. */
  onTap: () => void;
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
export function MushafTopStrip({
  insetTop,
  surahName,
  juz,
  uiLocale,
  onTap,
}: MushafTopStripProps) {
  const theme = useThemeColors();

  return (
    <Pressable
      testID="mushaf-top-strip"
      // Not one TalkBack element: the two labels inside are what a screen
      // reader wants, and `accessible` on the wrapper would swallow both
      // (see rn-accessible-view-collapses-children).
      accessible={false}
      onPress={onTap}
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
        {/* Nothing at all before the index resolves, rather than an empty
            <Text> carrying a label: gated only on the visible string, TalkBack
            announced "Juz 0" on a row showing nothing. */}
        {juz > 0 ? (
          <Text
            testID="page-juz"
            style={{ color: theme.mutedText, fontSize: typography.caption }}
          >
            {`${t(uiLocale, 'browse.juzLabel')} ${juz}`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
