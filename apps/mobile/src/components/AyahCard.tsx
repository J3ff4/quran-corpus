import { Pressable, Text, View } from 'react-native';
import { colors, typography } from '@/theme/tokens';

export interface AyahCardProps {
  ayahNumber: number;
  arabicText: string;
  translationText: string | null;
  bookmarked: boolean;
  playing: boolean;
  audioDisabled?: boolean;
  onToggleBookmark: (ayahNumber: number) => void;
  onToggleAudio: (ayahNumber: number) => void;
}

export function AyahCard({
  ayahNumber,
  arabicText,
  translationText,
  bookmarked,
  playing,
  audioDisabled = false,
  onToggleBookmark,
  onToggleAudio,
}: AyahCardProps) {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ color: colors.muted, fontSize: typography.caption }}>{ayahNumber}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable accessibilityRole="button" onPress={() => onToggleBookmark(ayahNumber)}>
            <Text style={{ color: bookmarked ? colors.accent : colors.muted }}>
              {bookmarked ? 'Remove bookmark' : 'Bookmark'}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={audioDisabled} onPress={() => onToggleAudio(ayahNumber)}>
            <Text style={{ color: audioDisabled ? colors.muted : colors.accent }}>{playing ? 'Pause' : 'Play'}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={{ color: colors.ink, fontFamily: 'Hafs', fontSize: typography.arabicReader, textAlign: 'right' }}>
        {arabicText}
      </Text>
      {translationText ? <Text style={{ color: colors.ink, fontSize: typography.body }}>{translationText}</Text> : null}
    </View>
  );
}
