import { Pressable, Text, View } from 'react-native';
import { WBW_PAGE_SIZE, wbwPageRange } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface VersePickerProps {
  from: number;
  to: number;
  /** The surah's length, which bounds the last page. */
  ayahCount: number;
  uiLocale: UiLocaleCode;
  onRange: (from: number, to: number) => void;
}

/**
 * Ten-ayah pager for the word-by-word screen: the current range between a
 * previous and a next control.
 *
 * No free ayah entry. The screen is reached from the reader or the morphology
 * tab, both of which already carry the ayah the user means, so a number field
 * would be a second way to do what the entry point just did.
 */
export function VersePicker({ from, to, ayahCount, uiLocale, onRange }: VersePickerProps) {
  const theme = useThemeColors();
  const atStart = from <= 1;
  const atEnd = to >= ayahCount;

  const step = (direction: -1 | 1) => {
    // Off `from`/`to` rather than a page index: the caller may open at any
    // ayah (a bookmark at 2:255 starts a page at 255, not at 251), so pages
    // are not aligned to multiples of ten.
    const nextStart = direction < 0 ? from - WBW_PAGE_SIZE : to + 1;
    const [start, end] = wbwPageRange(nextStart, ayahCount);
    onRange(start, end);
  };

  const controlStyle = {
    minHeight: touchTargets.minimum,
    minWidth: touchTargets.minimum,
    // Tighter than the 16 it carried as a full-width row: it shares its row
    // with the surah name, and the 48dp floor is what actually sizes the
    // target.
    paddingHorizontal: 8,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  };

  return (
    <View
      // No border, no background and no vertical padding: this sits in the
      // screen's heading row beside the surah name, not in a bar of its own.
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 4,
      }}
    >
      <Pressable
        testID="wbw-prev"
        accessibilityRole="button"
        accessibilityLabel={t(uiLocale, 'wbw.previous')}
        accessibilityState={{ disabled: atStart }}
        disabled={atStart}
        onPress={() => step(-1)}
        style={controlStyle}
      >
        {/* mutedText, not a faded accent: a disabled control that keeps the
            accent colour reads as tappable. */}
        <Text style={{ color: atStart ? theme.mutedText : theme.accent, fontSize: typography.body }}>
          ‹
        </Text>
      </Pressable>
      <Text
        // The surah is named at the other end of this same row, so the range
        // does not repeat it -- "Ayahs 11-20, 2" reads as a third number.
        accessibilityLabel={`${t(uiLocale, 'wbw.rangeLabel')} ${from}–${to}`}
        style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}
      >
        {`${from}–${to}`}
      </Text>
      <Pressable
        testID="wbw-next"
        accessibilityRole="button"
        accessibilityLabel={t(uiLocale, 'wbw.next')}
        accessibilityState={{ disabled: atEnd }}
        disabled={atEnd}
        onPress={() => step(1)}
        style={controlStyle}
      >
        <Text style={{ color: atEnd ? theme.mutedText : theme.accent, fontSize: typography.body }}>
          ›
        </Text>
      </Pressable>
    </View>
  );
}
