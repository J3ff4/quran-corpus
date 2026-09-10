import { Text, View } from 'react-native';
import { decodeSegment, posBucket, type WordSegment } from '@quran-corpus/data/mobile';
import { radii, typography } from '@/theme/tokens';
import { posColorFor } from '@/theme/formTint';
import { useThemeColors } from '@/theme/themeContext';

export interface SegmentPillProps {
  segment: WordSegment;
}

/**
 * One morphological segment of a word: its Arabic form beside its grammatical
 * category, on a 16% tint of its own POS colour.
 *
 * The tint, not `theme.surface`, and this is the second time the fill has been
 * wrong. The pill used to take the sheet's own surface colour, which made it
 * 1:1 against its container -- a chip held together by a hairline and nothing
 * else, which is what the owner read as poorly placed (2026-09-10). The form
 * chips in the dictionary have carried their own tint since M6g; these are the
 * same idea and had been left behind.
 *
 * No uiLocale prop: decodeSegment's labels are English only (POS_LABELS carries
 * en and ar, and none of the three UI locales is ar), so a locale argument here
 * would be a parameter nothing reads. Add it when the labels are translated.
 */
export function SegmentPill({ segment }: SegmentPillProps) {
  const theme = useThemeColors();
  // Body text and no tint where posBucket returns null: the corpus itself does
  // not surface that category, and a colour here would assert one.
  const { color, tint } = posColorFor(theme, posBucket(segment.pos_tag));

  return (
    <View
      testID="segment-pill"
      style={{
        // Row, not a stack. Stacked, a five-segment word built a wall of
        // two-line boxes the height of the sheet's whole body; side by side
        // the same word is one wrapped line of chips.
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: radii.chip,
        paddingHorizontal: 10,
        paddingVertical: 6,
        // Untinted buckets keep the hairline, which is the only thing that
        // would separate them from the group behind.
        ...(tint === undefined
          ? { borderWidth: 1, borderColor: theme.border }
          : { backgroundColor: tint }),
      }}
    >
      {segment.form_arabic ? (
        <Text
          testID="segment-pill-text"
          style={{
            color,
            fontFamily: 'Hafs',
            fontSize: typography.body,
            writingDirection: 'rtl',
          }}
        >
          {segment.form_arabic}
        </Text>
      ) : null}
      <Text testID="segment-pill-text" style={{ color, fontSize: typography.caption }}>
        {decodeSegment(segment).pos.en}
      </Text>
    </View>
  );
}
