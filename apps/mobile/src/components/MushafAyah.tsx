import { Pressable, Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { AyahMedallion } from './AyahMedallion';
import { AyahText } from './AyahText';

export interface MushafAyahProps {
  surahId: number;
  ayahNumber: number;
  arabicText: string;
  /** Empty until the reader has fetched this ayah's words; see AyahText. */
  words: Word[];
  bookmarked: boolean;
  playing: boolean;
  uiLocale: UiLocaleCode;
  audioDisabled?: boolean;
  onToggleBookmark: (ayahNumber: number) => void;
  onToggleAudio: (ayahNumber: number) => void;
  onWordPress: (word: Word) => void;
}

/**
 * One ayah as continuous mushaf: Arabic, its marker, and nothing else.
 *
 * Not AyahCard with the translation hidden. The card's own chrome -- the
 * header row, the rule between rows, the action labels -- is what makes rows
 * read as separate cards, and mushaf mode exists to make them read as one
 * page (mockup `1e`). Decision 20: continuous scroll, NOT fixed 15-line pages.
 *
 * The bookmark and play controls stay, because losing them would mean the two
 * modes differ in what you can *do* rather than in what you see. They sit
 * below the run at low emphasis, and they carry the same testIDs as the card's
 * so the reader's own tests exercise whichever renderer is mounted.
 */
export function MushafAyah({
  surahId,
  ayahNumber,
  arabicText,
  words,
  bookmarked,
  playing,
  uiLocale,
  audioDisabled = false,
  onToggleBookmark,
  onToggleAudio,
  onWordPress,
}: MushafAyahProps) {
  const theme = useThemeColors();

  return (
    <View style={{ paddingHorizontal: 20, paddingVertical: 10, gap: 6 }}>
      <AyahText
        textUthmani={arabicText}
        words={words}
        surahId={surahId}
        ayahNumber={ayahNumber}
        onWordPress={onWordPress}
        trailing={
          <Text>
            {' '}
            <AyahMedallion n={ayahNumber} uiLocale={uiLocale} />
          </Text>
        }
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
        <Pressable
          testID={`ayah-${surahId}-${ayahNumber}-bookmark`}
          accessibilityRole="button"
          accessibilityState={{ selected: bookmarked }}
          onPress={() => onToggleBookmark(ayahNumber)}
          style={controlStyle}
        >
          <Text style={{ color: bookmarked ? theme.accent : theme.mutedText, fontSize: typography.caption }}>
            {bookmarked ? t(uiLocale, 'reader.removeBookmark') : t(uiLocale, 'reader.bookmark')}
          </Text>
        </Pressable>
        <Pressable
          testID={`ayah-${surahId}-${ayahNumber}-audio`}
          accessibilityRole="button"
          // Without this TalkBack announces an ordinary button whose press does
          // nothing when audio is unconfigured.
          accessibilityState={{ disabled: audioDisabled }}
          disabled={audioDisabled}
          onPress={() => onToggleAudio(ayahNumber)}
          style={controlStyle}
        >
          <Text style={{ color: audioDisabled ? theme.mutedText : theme.accent, fontSize: typography.caption }}>
            {playing ? t(uiLocale, 'reader.pause') : t(uiLocale, 'reader.play')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const controlStyle = {
  minHeight: touchTargets.minimum,
  minWidth: touchTargets.minimum,
  justifyContent: 'center',
  alignItems: 'center',
} as const;
