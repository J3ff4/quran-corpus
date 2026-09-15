import { useMemo } from 'react';
import { Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { typography } from '@/theme/tokens';
import { ThemeContext, useThemeColors } from '@/theme/themeContext';
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
  /** Whether to draw it. Separate from `translationText` being null, which
   *  means the ayah has no translation in the chosen language at all: this one
   *  is the reader's own switch, and the card must not have to guess which of
   *  the two it is looking at. */
  showTranslation?: boolean;
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
  showTranslation = true,
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
  // The whole card takes the playhead's ground while this ayah recites (owner,
  // 2026-09-15), so the reader can find what is sounding without reading a
  // single icon -- the same green that bands the ayah on the mushaf page.
  //
  // Muted ink goes up to full ink with it, and it has to: `mutedText` is
  // 2.93:1 on the light band, and the medallion prints the ayah NUMBER in it.
  // No tint worth seeing leaves that colour readable -- muted is only 4.63:1 on
  // the bare page to begin with -- so the choice is a ground you cannot see or
  // an ayah number you cannot read. Raised through the context rather than
  // threaded as a prop through AyahMedallion, AyahControls and the icons
  // underneath them: the override is "everything inside this card", which is
  // exactly what a provider says and what four new props would only approximate.
  const playingTheme = useMemo(() => ({ ...theme, mutedText: theme.text }), [theme]);
  const card = (
    // A glass card per ayah, not a row with a rule under it (mockup 1j). The
    // margins are the gutter between cards; the reader's list adds none.
    <GlassSurface
      testID={`ayah-${surahId}-${ayahNumber}-card`}
      tint={playing ? theme.playingWash : undefined}
      style={{ marginHorizontal: 16, marginBottom: 11, padding: 20, gap: 14 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <AyahMedallion n={ayahNumber} uiLocale={uiLocale} />
        {/* Shared with the scroll mushaf's row until M7c replaced it with a
            pager; the printed page carries no controls at all (ruling 4), so
            these are the only ayah actions in the reader now. */}
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
      {showTranslation && translationText ? (
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

  return playing ? <ThemeContext.Provider value={playingTheme}>{card}</ThemeContext.Provider> : card;
}
