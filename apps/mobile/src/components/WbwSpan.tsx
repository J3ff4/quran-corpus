import { View } from 'react-native';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
import { radii } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

import type { Gloss } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';

import { WbwCell, wbwRhythm } from './WbwCell';
import { WbwSpanGloss } from './WbwSpanGloss';

export interface WbwSpanProps {
  words: Word[];
  gloss: Gloss | null;
  segmentsFor: (word: Word) => WordSegment[];
  uiLocale: UiLocaleCode;
  showPos?: boolean;
  glossLines?: number;
  compact?: boolean;
  onWordPress: (word: Word) => void;
}

/**
 * The words one Tasnim gloss covers, under one gloss.
 *
 * **This reverses decision 27** ("one cell per word, in every layout"), by the
 * owner's ruling of 2026-09-16. Decision 27 predates M9: it was made against a
 * mockup that merged cells for visual effect, with nothing in the data saying
 * which words belonged together. Tasnim's `gloss_group` is that missing fact --
 * "shubha yo'q" IS one gloss over لَا and رَيْبَ, and printing it under each
 * word separately claims the source said it twice.
 *
 * What decision 27 was protecting survives: every word keeps its own
 * `WbwCell`, so it keeps its own touch target, its own POS colours and its own
 * TalkBack label, and still opens its own sheet. Only the gloss is shared, and
 * only the border moves outward -- the cells inside drop theirs so the span
 * reads as one object rather than a box of boxes.
 *
 * A one-word span is rendered by WbwCell directly, not here: it would draw an
 * identical cell through two extra components.
 */
export function WbwSpan({
  words,
  gloss,
  segmentsFor,
  uiLocale,
  showPos = true,
  glossLines = 2,
  compact = false,
  onWordPress,
}: WbwSpanProps) {
  const theme = useThemeColors();
  // One rhythm for a phrase and for a single word. The span holds ALL of it --
  // its cells keep none of their own -- so a shared gloss lands on the same
  // line as its neighbours' (ruling R7).
  const rhythm = wbwRhythm(compact);

  return (
    <View
      testID="wbw-span"
      // Labelled, but NOT `accessible` -- that prop collapses children, and
      // every word inside is a button TalkBack has to reach individually.
      style={{
        alignItems: 'center',
        paddingHorizontal: compact ? 4 : 6,
        paddingVertical: rhythm.paddingVertical,
        gap: rhythm.gap,
        borderRadius: radii.chip,
        borderWidth: compact ? 0 : 1,
        borderColor: compact ? 'transparent' : theme.border,
      }}
    >
      {/* row-reverse, matching the run this sits in: the words of a phrase are
          still Arabic and still read right to left. */}
      <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start' }}>
        {words.map((word) => (
          <WbwCell
            key={word.id}
            word={word}
            segments={segmentsFor(word)}
            // Null, not the span's gloss: the shared text is drawn once below.
            // Handing it to each cell is exactly the repetition this fixes.
            gloss={null}
            uiLocale={uiLocale}
            showPos={showPos}
            glossLines={glossLines}
            compact={compact}
            inSpan
            hideGloss
            onPress={() => onWordPress(word)}
          />
        ))}
      </View>
      <WbwSpanGloss gloss={gloss} uiLocale={uiLocale} glossLines={glossLines} />
    </View>
  );
}
