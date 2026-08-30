import { Pressable, Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { AyahMedallion } from './AyahMedallion';
import { AyahText } from './AyahText';
import { GlassSurface } from './GlassSurface';
import { Icon } from './icons/Icon';

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
        {/* Icons, not words. As labels this row was locale-sized: "Bookmark ·
            Play" fits, "Удалить закладку · Воспроизвести" does not, and the
            Play control was clipped clean off the card edge on device
            (2026-08-29) because GlassSurface hides its overflow. Three glyphs
            are the same width in every locale, so there is nothing left to
            overflow -- the wrap that fix added is gone with the labels. */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable
            // Same testID MushafAyah gives its own bookmark: the reader swaps
            // renderers by mode, and a test that reaches for one handle has to
            // find whichever renderer is mounted.
            testID={`ayah-${surahId}-${ayahNumber}-bookmark`}
            accessibilityRole="button"
            accessibilityState={{ selected: bookmarked }}
            // The wording the glyph replaced. It was the button's accessible
            // name when it was visible text; naming it explicitly is what keeps
            // TalkBack saying the same thing now that it is a shape.
            accessibilityLabel={bookmarked ? t(uiLocale, 'reader.removeBookmark') : t(uiLocale, 'reader.bookmark')}
            onPress={() => onToggleBookmark(ayahNumber)}
            // Without a size floor the tap target is only the glyph box --
            // under the 24x24 of WCAG 2.2 SC 2.5.8 and far under Android's 48dp,
            // on the reader's two primary actions.
            style={pressableStyle}
          >
            {/* Filled when saved, outline when not. State cannot ride on the
                accent alone (WCAG 1.4.1) -- the wording used to be the second
                channel and the fill is what replaces it. */}
            <Icon
              testID={`ayah-${surahId}-${ayahNumber}-bookmark-icon`}
              name="bookmark"
              filled={bookmarked}
              color={bookmarked ? theme.accent : theme.mutedText}
              size={21}
            />
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
              <Icon
                testID={`ayah-${surahId}-${ayahNumber}-note-icon`}
                name="note"
                filled={note !== null}
                color={note === null ? theme.mutedText : theme.accent}
                size={21}
              />
            </Pressable>
          ) : null}
          <Pressable
            testID={`ayah-${surahId}-${ayahNumber}-audio`}
            accessibilityRole="button"
            // Without this TalkBack announces an ordinary button whose press
            // does nothing when audio is unconfigured.
            accessibilityState={{ disabled: audioDisabled }}
            accessibilityLabel={playing ? t(uiLocale, 'reader.pause') : t(uiLocale, 'reader.play')}
            disabled={audioDisabled}
            onPress={() => onToggleAudio(ayahNumber)}
            style={pressableStyle}
          >
            <Icon
              testID={`ayah-${surahId}-${ayahNumber}-audio-icon`}
              // Play is a solid triangle, pause two bars -- the standard pair.
              // An outline triangle at this size reads as a chevron.
              name={playing ? 'pause' : 'play'}
              filled={!playing}
              color={audioDisabled ? theme.mutedText : theme.accent}
              size={21}
            />
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
