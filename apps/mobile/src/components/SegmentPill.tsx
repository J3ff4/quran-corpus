import { Text, View } from 'react-native';
import { decodeSegment, posBucket, type WordSegment } from '@quran-corpus/data/mobile';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface SegmentPillProps {
  segment: WordSegment;
}

/**
 * One morphological segment of a word: its Arabic form above its grammatical
 * category, tinted by POS bucket.
 *
 * No uiLocale prop: decodeSegment's labels are English only (POS_LABELS carries
 * en and ar, and none of the three UI locales is ar), so a locale argument here
 * would be a parameter nothing reads. Add it when the labels are translated.
 */
export function SegmentPill({ segment }: SegmentPillProps) {
  const theme = useThemeColors();
  const bucket = posBucket(segment.pos_tag);
  // Body text, not the `other` grey: posBucket returns null for a category the
  // corpus itself does not surface, and the muted colour would assert one.
  const labelColor = bucket ? theme.pos[bucket] : theme.text;

  return (
    <View
      style={{
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: theme.surface,
        alignItems: 'center',
        gap: 2,
      }}
    >
      {segment.form_arabic ? (
        <Text
          style={{
            color: theme.text,
            fontFamily: 'Hafs',
            fontSize: typography.body,
            writingDirection: 'rtl',
          }}
        >
          {segment.form_arabic}
        </Text>
      ) : null}
      <Text style={{ color: labelColor, fontSize: typography.caption }}>
        {decodeSegment(segment).pos.en}
      </Text>
    </View>
  );
}
