import { Text } from 'react-native';
import { posBucket, type Word, type WordSegment } from '@quran-corpus/data/mobile';
import { joinSegmentRuns } from '@/text/arabicJoining';
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
    // textAlign places the block; writingDirection is iOS-only (see AyahText).
    // Android resolves direction from the content.
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

  // Android shapes every nested <Text> as its own run, so the segments have to
  // be rewritten before they can be drawn as one joined word.
  const runs = joinSegmentRuns(segments.map((segment) => segment.form_arabic ?? ''));

  return (
    // Nested <Text>, no gap, no wrapper View per segment: adjacent runs of one
    // text node is the closest Android gets to a single shaped word, and a box
    // per segment would not join at all. The whole word carries one accessible
    // name, since TalkBack reading five segments as five strings is not the
    // word -- and the joiners above are invisible to it either way.
    <Text testID="segmented-word" accessibilityLabel={word.text_arabic} style={style}>
      {segments.map((segment, index) => {
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
            {runs[index]}
          </Text>
        );
      })}
    </Text>
  );
}
