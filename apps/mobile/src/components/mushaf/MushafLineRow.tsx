import { Text } from 'react-native';
import type { MushafWord } from '@quran-corpus/data/mobile';

import { mushafFontFamily } from '@/mushaf/pageFont';

export interface MushafLineRowProps {
  page: number;
  words: MushafWord[];
  fontSize: number;
  lineHeight: number;
  /** One colour per ayah, so the three highlight states resolve outside this
   *  component and a line stays a pure renderer. */
  colorForAyah: (surahId: number, ayahNumber: number) => string;
  onWordPress: (word: MushafWord) => void;
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
  colorForAyah,
  onWordPress,
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
      {words.map((word) => (
        <Text
          key={`${word.surahId}:${word.ayahNumber}:${word.position}`}
          onPress={() => onWordPress(word)}
          style={{ color: colorForAyah(word.surahId, word.ayahNumber) }}
        >
          {stripSeparators(word.glyph)}
        </Text>
      ))}
    </Text>
  );
}
