import { Text } from 'react-native';
import { posBucket, type Word, type WordSegment } from '@quran-corpus/data/mobile';
import { useThemeColors } from '@/theme/themeContext';

export interface SegmentedWordProps {
  word: Word;
  segments: WordSegment[];
  fontSize: number;
}

/**
 * The tapped word with each morphological segment in its own POS colour.
 * Ported from web's SegmentPills at size="lg" -- the sheet used to print the
 * word in body colour while the pills beneath it were tinted, which read as
 * two unrelated things (owner device report, 2026-08-16).
 */
export function SegmentedWord({ word, segments, fontSize }: SegmentedWordProps) {
  const theme = useThemeColors();
  const style = {
    color: theme.text,
    fontFamily: 'Hafs',
    fontSize,
    textAlign: 'right' as const,
    // See AyahText: textAlign places the block, writingDirection drives the
    // bidi resolution inside the Arabic run.
    writingDirection: 'rtl' as const,
  };

  // Any missing form_arabic and the joined word would be incomplete, with
  // nothing on screen saying so. Same guard web's SegmentPills carries.
  if (segments.length === 0 || segments.some((segment) => !segment.form_arabic)) {
    return (
      <Text testID="word-fallback" style={style}>
        {word.text_arabic}
      </Text>
    );
  }

  return (
    // Nested <Text>, no gap, no wrapper View per segment: Arabic letters join
    // across adjacent runs of one text node and stop joining across boxes.
    // The whole word carries one accessible name, since TalkBack reading five
    // segments as five strings is not the word.
    <Text testID="segmented-word" accessibilityLabel={word.text_arabic} style={style}>
      {segments.map((segment) => {
        const bucket = posBucket(segment.pos_tag);
        return (
          <Text
            key={segment.id}
            testID="segment-run"
            // Body text, not the `other` grey: posBucket returns null for a
            // category the corpus does not surface, and the muted colour
            // would assert one. Same rule as SegmentPill.
            style={{ color: bucket ? theme.pos[bucket] : theme.text }}
          >
            {segment.form_arabic}
          </Text>
        );
      })}
    </Text>
  );
}
