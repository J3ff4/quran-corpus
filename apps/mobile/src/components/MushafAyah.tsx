import { Pressable, Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { AyahMedallion } from './AyahMedallion';
import { AyahText } from './AyahText';
import { Icon } from './icons/Icon';

export interface MushafAyahProps {
  surahId: number;
  ayahNumber: number;
  arabicText: string;
  /** Empty until the reader has fetched this ayah's words; see AyahText. */
  words: Word[];
  bookmarked: boolean;
  /** See AyahCard: only ever non-null on a bookmarked ayah. */
  note?: string | null;
  playing: boolean;
  uiLocale: UiLocaleCode;
  audioDisabled?: boolean;
  onToggleBookmark: (ayahNumber: number) => void;
  onEditNote?: (ayahNumber: number) => void;
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
  note = null,
  playing,
  uiLocale,
  audioDisabled = false,
  onToggleBookmark,
  onEditNote,
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
      {/* The same three glyphs AyahCard carries, for the same reason: the two
          renderers must not differ in what you can DO, and words here were
          locale-sized. */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4 }}>
        <Pressable
          testID={`ayah-${surahId}-${ayahNumber}-bookmark`}
          accessibilityRole="button"
          accessibilityState={{ selected: bookmarked }}
          // Was the visible text; naming it keeps TalkBack unchanged now that
          // the control is a shape. See AyahCard.
          accessibilityLabel={bookmarked ? t(uiLocale, 'reader.removeBookmark') : t(uiLocale, 'reader.bookmark')}
          onPress={() => onToggleBookmark(ayahNumber)}
          style={controlStyle}
        >
          <Icon
            testID={`ayah-${surahId}-${ayahNumber}-bookmark-icon`}
            name="bookmark"
            filled={bookmarked}
            color={bookmarked ? theme.accent : theme.mutedText}
            size={20}
          />
        </Pressable>
        {/* Present in both renderers, for the reason the bookmark is: losing it
            here would mean the two modes differ in what you can DO, not just
            in what you see. */}
        {bookmarked && onEditNote ? (
          <Pressable
            testID={`ayah-${surahId}-${ayahNumber}-note`}
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, note === null ? 'bookmarks.addNote' : 'bookmarks.editNote')}
            onPress={() => onEditNote(ayahNumber)}
            style={controlStyle}
          >
            <Icon
              testID={`ayah-${surahId}-${ayahNumber}-note-icon`}
              name="note"
              filled={note !== null}
              color={note === null ? theme.mutedText : theme.accent}
              size={20}
            />
          </Pressable>
        ) : null}
        <Pressable
          testID={`ayah-${surahId}-${ayahNumber}-audio`}
          accessibilityRole="button"
          // Without this TalkBack announces an ordinary button whose press does
          // nothing when audio is unconfigured.
          accessibilityState={{ disabled: audioDisabled }}
          accessibilityLabel={playing ? t(uiLocale, 'reader.pause') : t(uiLocale, 'reader.play')}
          disabled={audioDisabled}
          onPress={() => onToggleAudio(ayahNumber)}
          style={controlStyle}
        >
          <Icon
            testID={`ayah-${surahId}-${ayahNumber}-audio-icon`}
            name={playing ? 'pause' : 'play'}
            filled={!playing}
            color={audioDisabled ? theme.mutedText : theme.accent}
            size={20}
          />
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
