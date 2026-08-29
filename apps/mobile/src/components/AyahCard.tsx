import { Pressable, Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { AyahMedallion } from './AyahMedallion';
import { AyahText } from './AyahText';
import { GlassSurface } from './GlassSurface';

const pressableStyle = {
  minHeight: touchTargets.minimum,
  minWidth: touchTargets.minimum,
  justifyContent: 'center',
  alignItems: 'center',
} as const;

export interface AyahCardProps {
  surahId: number;
  ayahNumber: number;
  arabicText: string;
  /** Empty until the reader has fetched this ayah's words; see AyahText. */
  words: Word[];
  translationText: string | null;
  bookmarked: boolean;
  /** This ayah's note, or null for none. Only ever non-null on a bookmarked
   *  ayah -- a note is an attribute of a bookmark. */
  note?: string | null;
  playing: boolean;
  uiLocale: UiLocaleCode;
  audioDisabled?: boolean;
  onToggleBookmark: (ayahNumber: number) => void;
  onEditNote?: (ayahNumber: number) => void;
  onToggleAudio: (ayahNumber: number) => void;
  onWordPress: (word: Word) => void;
}

export function AyahCard({
  surahId,
  ayahNumber,
  arabicText,
  words,
  translationText,
  bookmarked,
  note = null,
  playing,
  uiLocale,
  audioDisabled = false,
  onToggleBookmark,
  onEditNote,
  onToggleAudio,
  onWordPress,
}: AyahCardProps) {
  const theme = useThemeColors();
  return (
    // A glass card per ayah, not a row with a rule under it (mockup 1j). The
    // margins are the gutter between cards; the reader's list adds none.
    <GlassSurface style={{ marginHorizontal: 16, marginBottom: 11, padding: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <AyahMedallion n={ayahNumber} uiLocale={uiLocale} />
        {/* Shrinks and wraps rather than running off the card. These are text
            labels, and the card is fixed-width: "Remove bookmark · Play" fits
            in English and clipped the Play control clean off the right edge in
            Russian and Uzbek, whose verbs are half again as long (device,
            2026-08-29). GlassSurface clips its overflow, so nothing warned. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1, gap: 10 }}>
          <Pressable
            // Same testID MushafAyah gives its own bookmark: the reader swaps
            // renderers by mode, and a test that reaches for one handle has to
            // find whichever renderer is mounted.
            testID={`ayah-${surahId}-${ayahNumber}-bookmark`}
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
          {/* Only on a bookmarked ayah. setBookmarkNote is an UPDATE, never an
              upsert, so a note written against an unbookmarked ayah would land
              nowhere -- an affordance that silently does nothing. */}
          {bookmarked && onEditNote ? (
            <Pressable
              testID={`ayah-${surahId}-${ayahNumber}-note`}
              accessibilityRole="button"
              // The two states differ by label, not by colour alone: the icon
              // itself says nothing to TalkBack.
              accessibilityLabel={t(uiLocale, note === null ? 'bookmarks.addNote' : 'bookmarks.editNote')}
              onPress={() => onEditNote(ayahNumber)}
              style={pressableStyle}
            >
              <Text style={{ color: note === null ? theme.mutedText : theme.accent }}>
                {note === null ? '✎' : '✐'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            testID={`ayah-${surahId}-${ayahNumber}-audio`}
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
      {/* The basmala banner is AyahText's: it renders only when the alignment
          actually pulled the basmala out of the ayah's run. */}
      <AyahText
        textUthmani={arabicText}
        words={words}
        surahId={surahId}
        ayahNumber={ayahNumber}
        onWordPress={onWordPress}
      />
      {translationText ? (
        <Text
          style={{
            color: theme.text,
            fontSize: typography.body,
            // 1.65, as the mockup sets it: the translation is the one long
            // prose run on the screen and the Arabic above it is airy.
            lineHeight: Math.round(typography.body * 1.65),
            // The rule separates the two scripts inside one card, where the
            // old layout had a rule between whole ayahs.
            borderTopWidth: 1,
            borderTopColor: theme.border,
            paddingTop: 14,
          }}
        >
          {translationText}
        </Text>
      ) : null}
    </GlassSurface>
  );
}
