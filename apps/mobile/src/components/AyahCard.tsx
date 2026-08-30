import { Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { AyahControls } from './AyahControls';
import { AyahMedallion } from './AyahMedallion';
import { AyahText } from './AyahText';
import { GlassSurface } from './GlassSurface';

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
        {/* Shared with MushafAyah, which is the point: the two renderers
            differ in what you SEE, never in what you can DO. */}
        <AyahControls
          surahId={surahId}
          ayahNumber={ayahNumber}
          bookmarked={bookmarked}
          note={note}
          playing={playing}
          uiLocale={uiLocale}
          audioDisabled={audioDisabled}
          onToggleBookmark={onToggleBookmark}
          onEditNote={onEditNote}
          onToggleAudio={onToggleAudio}
        />
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
