import { Text } from 'react-native';
import type { MushafWord } from '@quran-corpus/data/mobile';

import { mushafFontFamily } from '@/mushaf/pageFont';

export interface MushafLineRowProps {
  page: number;
  words: MushafWord[];
  fontSize: number;
  lineHeight: number;
  /** One colour per word, so the four highlight states resolve outside this
   *  component and a line stays a pure renderer. */
  colorForWord: (surahId: number, ayahNumber: number, position: number) => string;
  /** The wash under the word being long-pressed, and undefined everywhere
   *  else. Separate from the colour because a pressed word and a playing one
   *  are both accent-coloured. */
  backgroundForWord: (surahId: number, ayahNumber: number, position: number) => string | undefined;
  /** A long press, which is the only thing that opens the word sheet since
   *  M7d (ruling 4): a single tap belongs to the chrome. */
  onWordLongPress: (word: MushafWord) => void;
  /** Press and release of a word, for the wash. Fired on the way down, before
   *  the long press has been recognised, so the mark is under the finger while
   *  it waits. */
  onWordPressIn: (word: MushafWord) => void;
  onWordPressOut: () => void;
  /** A plain tap anywhere on the line. Toggles the chrome and nothing else --
   *  a word's own tap has to do this too, or the parts of the page that are
   *  covered in words would be dead to it. */
  onTap: () => void;
}

/**
 * 198 layout rows, across 197 pages, hold a word whose two glyph codes are
 * separated by a space. Both codes are always present in that page's own font;
 * U+0020 is the one codepoint the QCF fonts lack. It is a separator in the
 * source data rather than something print draws, so the metrics in Task 2 gave
 * it zero width -- drawing it here would make those pages wider than they were
 * measured, and would drop the run into the system face besides.
 */
const stripSeparators = (glyph: string) => glyph.replace(/ /g, '');

// The long press runs at RN's own 500ms: `delayLongPress` is a Pressable prop,
// and a nested <Text> takes none. Wrapping each word in a Pressable is not the
// way round it -- a View between two joined Arabic letters breaks the shaping
// of the whole run (M6, f409ed0), which is the defect this component's own
// header note exists to avoid. If 500ms reads as slow on device, the wash that
// lands on press-in is what tells the reader the press registered.

/**
 * One line of a mushaf page: its words as pre-shaped QCF glyphs.
 *
 * Joined with '' and NOT with a space, for the same reason the separator above
 * is stripped: a space between words splits the line into a fallback run per
 * word and the whole line renders in the system face -- as plausible Arabic
 * rather than tofu, which is the failure mode that hides (M7a §4).
 *
 * Centred rather than justified: measured across all 8,820 lines, 99% sit
 * within 5% of their page's widest line, because QCF pre-justifies them. The
 * remaining 1% are the last line of a surah, which print centres anyway. So
 * centring is both correct and free of a width threshold to misclassify.
 */
export function MushafLineRow({
  page,
  words,
  fontSize,
  lineHeight,
  colorForWord,
  backgroundForWord,
  onWordLongPress,
  onWordPressIn,
  onWordPressOut,
  onTap,
}: MushafLineRowProps) {
  return (
    <Text
      // The glyphs are private-use codepoints; MushafPage publishes the real
      // Uthmani text per ayah instead (ruling 12).
      accessibilityElementsHidden
      numberOfLines={1}
      importantForAccessibility="no-hide-descendants"
      style={{
        fontFamily: mushafFontFamily(page),
        fontSize,
        lineHeight,
        textAlign: 'center',
      }}
    >
      {words.map((word) => {
        const background = backgroundForWord(word.surahId, word.ayahNumber, word.position);
        return (
          <Text
            key={`${word.surahId}:${word.ayahNumber}:${word.position}`}
            onPress={onTap}
            onLongPress={() => onWordLongPress(word)}
            onPressIn={() => onWordPressIn(word)}
            onPressOut={onWordPressOut}
            style={{
              color: colorForWord(word.surahId, word.ayahNumber, word.position),
              ...(background === undefined ? null : { backgroundColor: background }),
            }}
          >
            {stripSeparators(word.glyph)}
          </Text>
        );
      })}
    </Text>
  );
}
