import { Pressable, Text, View } from 'react-native';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const pressableStyle = {
  minHeight: touchTargets.minimum,
  minWidth: touchTargets.minimum,
  justifyContent: 'center',
  alignItems: 'center',
} as const;

export interface AyahCardProps {
  ayahNumber: number;
  arabicText: string;
  translationText: string | null;
  bookmarked: boolean;
  playing: boolean;
  uiLocale: UiLocaleCode;
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
  uiLocale,
  audioDisabled = false,
  onToggleBookmark,
  onToggleAudio,
}: AyahCardProps) {
  const theme = useThemeColors();
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>{ayahNumber}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: bookmarked }}
            onPress={() => onToggleBookmark(ayahNumber)}
            // Without a size floor the tap target is only the text line box --
            // under the 24x24 of WCAG 2.2 SC 2.5.8 and far under Android's 48dp,
            // on the reader's two primary actions.
            style={pressableStyle}
          >
            <Text style={{ color: bookmarked ? theme.accent : theme.mutedText }}>
              {bookmarked ? t(uiLocale, 'reader.removeBookmark') : t(uiLocale, 'reader.bookmark')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            // Without this TalkBack announces an ordinary button whose press
            // does nothing when audio is unconfigured.
            accessibilityState={{ disabled: audioDisabled }}
            disabled={audioDisabled}
            onPress={() => onToggleAudio(ayahNumber)}
            style={pressableStyle}
          >
            <Text style={{ color: audioDisabled ? theme.mutedText : theme.accent }}>
              {playing ? t(uiLocale, 'reader.pause') : t(uiLocale, 'reader.play')}
            </Text>
          </Pressable>
        </View>
      </View>
      <Text
        style={{
          color: theme.text,
          fontFamily: 'Hafs',
          fontSize: typography.arabicReader,
          textAlign: 'right',
          // textAlign only aligns the block. writingDirection drives the bidi
          // resolution, which is what orders ayah markers, digits and
          // punctuation correctly inside the Arabic run on Android.
          writingDirection: 'rtl',
        }}
      >
        {arabicText}
      </Text>
      {translationText ? <Text style={{ color: theme.text, fontSize: typography.body }}>{translationText}</Text> : null}
    </View>
  );
}
