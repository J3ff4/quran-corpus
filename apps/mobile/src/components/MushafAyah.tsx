import { Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { AyahControls } from './AyahControls';
import { AyahMedallion } from './AyahMedallion';
import { AyahText } from './AyahText';

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
 * The controls stay, because losing them would mean the two modes differ in
 * what you can *do* rather than in what you see. They sit below the run at low
 * emphasis, and they are the same AyahControls the card draws, so the two
 * renderers cannot drift.
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
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <AyahControls
          surahId={surahId}
          ayahNumber={ayahNumber}
          bookmarked={bookmarked}
          note={note}
          playing={playing}
          uiLocale={uiLocale}
          audioDisabled={audioDisabled}
          // A point smaller than the card's: here the row sits under the
          // Arabic run at low emphasis rather than in a card header.
          size={20}
          onToggleBookmark={onToggleBookmark}
          onEditNote={onEditNote}
          onToggleAudio={onToggleAudio}
        />
      </View>
    </View>
  );
}
