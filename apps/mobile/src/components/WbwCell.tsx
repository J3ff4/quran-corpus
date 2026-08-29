import { Pressable, Text } from 'react-native';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useArabicSizes } from '@/theme/useArabicSizes';
import { useThemeColors } from '@/theme/themeContext';

import type { Gloss } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';

import { GlossLangTag } from './GlossLangTag';
import { SegmentedWord } from './SegmentedWord';

export interface WbwCellProps {
  word: Word;
  segments: WordSegment[];
  gloss: Gloss | null;
  uiLocale: UiLocaleCode;
  /** Dense drops the POS tag row; the two 2c layouts keep it. */
  showPos?: boolean;
  /** Dense clamps the gloss to one line -- that is the whole density mode. */
  glossLines?: number;
  compact?: boolean;
  onPress: () => void;
}

/**
 * One word: its Arabic in POS colours, its tag, its gloss.
 *
 * Shared by every word-by-word layout rather than copied into each. The cell is
 * the part all of them agree on (decision 27, one cell per word); they differ
 * only in how the cells are laid out.
 */
export function WbwCell({
  word,
  segments,
  gloss,
  uiLocale,
  showPos = true,
  glossLines = 2,
  compact = false,
  onPress,
}: WbwCellProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  return (
    <Pressable
      testID="wbw-cell"
      accessibilityRole="button"
      // The whole word, not word + tag + gloss: TalkBack reading three strings
      // per cell turns one ayah into a hundred and fifty announcements. The
      // sheet is where the detail lives.
      accessibilityLabel={word.text_arabic}
      onPress={onPress}
      style={{
        minHeight: touchTargets.minimum,
        alignItems: 'center',
        gap: compact ? 0 : 3,
        paddingHorizontal: compact ? 4 : 8,
        paddingVertical: compact ? 2 : 9,
        borderRadius: radii.chip,
        // Dense is a bare interlinear run (mockup 2d): a border per word at
        // that spacing is a grid of boxes, which is the layout it replaces.
        borderWidth: compact ? 0 : 1,
        borderColor: compact ? 'transparent' : theme.border,
      }}
    >
      <SegmentedWord word={word} segments={segments} fontSize={Math.round(sizes.reader * 0.7)} />
      {showPos && word.pos_tag ? (
        <Text testID={`wbw-pos-${word.position}`} style={{ color: theme.mutedText, fontSize: typography.caption - 3 }}>
          {word.pos_tag}
        </Text>
      ) : null}
      <Text
        testID={`wbw-gloss-${word.position}`}
        numberOfLines={glossLines}
        style={{ color: theme.text, fontSize: typography.caption - 1, textAlign: 'center' }}
      >
        {gloss?.text ?? ''}
      </Text>
      <GlossLangTag gloss={gloss} uiLocale={uiLocale} fontSize={typography.caption - 3} />

    </Pressable>
  );
}
