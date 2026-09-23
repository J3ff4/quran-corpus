import { memo, useMemo } from 'react';
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
  /** This ayah's word rows, read at press time rather than passed as data --
   *  see AyahText. Returns an empty array until they are fetched. */
  getWords: () => Word[];
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

function AyahCardBody({
  surahId,
  ayahNumber,
  arabicText,
  getWords,
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
        getWords={getWords}
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

  // The provider is always the root, and only its value changes. Rendered
  // conditionally, the root element type changed every time the playhead
  // entered or left this ayah -- which remounts the whole card subtree and
  // takes descendant state and accessibility focus with it, once per ayah of a
  // continuous recitation.
  return (
    <ThemeContext.Provider value={playing ? playingTheme : theme}>{card}</ThemeContext.Provider>
  );
}

/**
 * Memoised, and that is load-bearing rather than a precaution.
 *
 * The reader prefetches an ayah's words as it scrolls past, four ayahs at a
 * time (WORD_LOOKAHEAD). While that map was a render prop, each query that
 * landed replaced the whole map, so crossing one ayah boundary committed up
 * to four new map identities and -- unmemoised -- re-rendered every card in
 * the window on each of them: twenty cards' worth of Arabic re-laid-out, four
 * times, mid-scroll. That was the jolt the owner reported at the same point in
 * every ayah, upward and downward (2026-09-22).
 *
 * The map is no longer a render prop at all (`getWords`, 2026-09-23), so a
 * prefetch now re-renders nothing. The memo still earns its place for every
 * other reason a parent re-renders -- a bookmark toggle, an audio state
 * change, a scroll-driven header update -- which are frequent and reach every
 * mounted card.
 */
export const AyahCard = memo(AyahCardBody);
