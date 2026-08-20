import { Pressable, Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { WbwPage } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

import { SegmentPill } from './SegmentPill';

export interface WbwGridProps {
  page: WbwPage;
  uiLocale: UiLocaleCode;
  onWordPress: (word: Word) => void;
}

/**
 * One ayah as a grid of word cells, each showing its Uthmani form above its
 * morphological segments.
 *
 * Per D6 this is the grid surface, not the mushaf: the reader keeps native
 * line breaking with nested <Text>, and losing it here is the intended trade
 * for a real 48dp Pressable -- and so a real accessibility node -- per word.
 */
export function WbwGrid({ page, uiLocale, onWordPress }: WbwGridProps) {
  const theme = useThemeColors();

  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 12, gap: 8 }}>
      <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
        {`${t(uiLocale, 'reader.ayahLabel')} ${page.ayahNumber}`}
      </Text>
      <View
        testID="wbw-row"
        style={{
          flexDirection: 'row-reverse',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {page.words.map((word) => (
          <Pressable
            key={word.id}
            testID="wbw-cell"
            accessibilityRole="button"
            accessibilityLabel={word.text_arabic}
            onPress={() => onWordPress(word)}
            style={{
              minHeight: touchTargets.minimum,
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 6,
              paddingVertical: 6,
              borderRadius: 8,
              // SegmentPill paints theme.surface with a theme.border hairline,
              // so a cell on theme.background would leave the pill floating on
              // the page with no cell to belong to. The card surface is what
              // gives the grid its rows.
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text
              style={{
                color: theme.text,
                fontFamily: 'Hafs',
                fontSize: typography.body * 1.5,
                // textAlign places the block; writingDirection is iOS-only
                // (see AyahText). Android resolves direction from content.
                writingDirection: 'rtl',
              }}
            >
              {word.text_arabic}
            </Text>
            {/* This word's own segments. Rendering `page.segments` whole would
                give every cell the entire ayah's grammar, and it would look
                entirely plausible. A word with no analysed segments still gets
                its cell -- dropping it would silently shorten the ayah. */}
            {(page.segments.get(word.id) ?? []).map((segment) => (
              <SegmentPill key={segment.id} segment={segment} />
            ))}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
