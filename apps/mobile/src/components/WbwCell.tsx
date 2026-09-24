import { Pressable, Text } from 'react-native';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useArabicSizes } from '@/theme/useArabicSizes';
import { useThemeColors } from '@/theme/themeContext';

import type { Gloss } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';

import { GlossLangTag } from './GlossLangTag';
import { SegmentedWord } from './SegmentedWord';

/**
 * The vertical rhythm a word is laid out on: the padding above its Arabic and
 * the gap between Arabic, tag and gloss.
 *
 * Exported because WbwSpan lays out on the same rhythm and must not re-derive
 * it. A span used to carry its own numbers -- 4 outside plus a compact cell's 2
 * inside, against a plain cell's 9 -- so a shared gloss sat lower than a single
 * word's, which is exactly what the Uzbek run showed (owner, 2026-09-22). The
 * drift IS the bug, so the two read one definition.
 */
export function wbwRhythm(compact: boolean): { paddingVertical: number; gap: number } {
  return compact ? { paddingVertical: 2, gap: 0 } : { paddingVertical: 9, gap: 3 };
}

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
  /** Set when the cell sits inside a WbwSpan: the span owns the vertical
   *  rhythm for the whole phrase, so the cell keeps none of its own padding
   *  above or below. Anything else and the span's words start lower than their
   *  single-word neighbours. */
  inSpan?: boolean;
  /** Set when the cell sits inside a WbwSpan, which draws the shared gloss
   *  once below the whole run. Without it the span would reserve an empty
   *  gloss line under every word and sit the shared text below the gap. */
  hideGloss?: boolean;
  onPress: () => void;
}

/**
 * One word: its Arabic in POS colours, its tag, its gloss.
 *
 * Shared by every word-by-word layout rather than copied into each. The cell is
 * the part all of them agree on -- one cell per word, so one touch target and
 * one TalkBack label per word -- and they differ only in how the cells are laid
 * out. Words that Tasnim glosses as a phrase are wrapped by WbwSpan, which
 * merges the BORDER and the gloss but still renders one of these per word.
 */
export function WbwCell({
  word,
  segments,
  gloss,
  uiLocale,
  showPos = true,
  glossLines = 2,
  compact = false,
  inSpan = false,
  hideGloss = false,
  onPress,
}: WbwCellProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();
  const rhythm = wbwRhythm(compact);

  return (
    <Pressable
      testID="wbw-cell"
      accessibilityRole="button"
      // The whole word, not word + tag + gloss: TalkBack reading three strings
      // per cell turns one ayah into a hundred and fifty announcements. The
      // sheet is where the detail lives.
      accessibilityLabel={word.text_arabic}
      onPress={onPress}
      // A span holds the rhythm for its whole phrase, so a cell inside one
      // must hold no height of its own either: the floor is 48 and the Arabic,
      // tag and no gloss come to about 42, so the floor -- not the content --
      // set the row's height and pushed the shared gloss ~6dp below its
      // single-word neighbours'. Padding parity alone does not give rhythm
      // parity while the box has a floor its content never reaches. The touch
      // target the floor was there for survives as hitSlop, which grows the
      // press area without growing the box.
      //
      // Vertical only. The cells of a span sit edge to edge in a row with 4dp
      // of horizontal padding, so 8dp of slop on the sides overlaps the
      // neighbour by up to 16dp -- and where two targets overlap Android hits
      // the later sibling, so a tap near one word's leading edge opens the
      // word beside it. The floor this replaced was a height; the slop that
      // replaces it is one too.
      hitSlop={inSpan ? { top: 8, bottom: 8 } : undefined}
      style={{
        minHeight: inSpan ? 0 : touchTargets.minimum,
        alignItems: 'center',
        gap: rhythm.gap,
        paddingHorizontal: compact || inSpan ? 4 : 8,
        paddingVertical: inSpan ? 0 : rhythm.paddingVertical,
        borderRadius: radii.chip,
        // Dense is a bare interlinear run (mockup 2d): a border per word at
        // that spacing is a grid of boxes, which is the layout it replaces.
        borderWidth: compact || inSpan ? 0 : 1,
        borderColor: compact || inSpan ? 'transparent' : theme.border,
      }}
    >
      <SegmentedWord word={word} segments={segments} fontSize={Math.round(sizes.reader * 0.7)} />
      {showPos && word.pos_tag ? (
        <Text testID={`wbw-pos-${word.position}`} style={{ color: theme.mutedText, fontSize: typography.caption - 3 }}>
          {word.pos_tag}
        </Text>
      ) : null}
      {hideGloss ? null : (
        <>
          <Text
            testID={`wbw-gloss-${word.position}`}
            numberOfLines={glossLines}
            style={{ color: theme.text, fontSize: typography.caption - 1, textAlign: 'center' }}
          >
            {gloss?.text ?? ''}
          </Text>
          <GlossLangTag gloss={gloss} uiLocale={uiLocale} fontSize={typography.caption - 3} />
        </>
      )}

    </Pressable>
  );
}
