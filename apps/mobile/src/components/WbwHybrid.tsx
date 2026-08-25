import { View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { WbwPage } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';

import { AyahMedallion } from './AyahMedallion';
import { GlassSurface } from './GlassSurface';
import { WbwAyahLine } from './WbwAyahLine';
import { WbwCell } from './WbwCell';

export interface WbwHybridProps {
  page: WbwPage;
  uiLocale: UiLocaleCode;
  /** Keyed by `word.id`, the whole surah's map -- see getSurahGlosses. */
  glosses: Map<number, string>;
  onWordPress: (word: Word) => void;
}

/**
 * The `2c` hybrid layout: the ayah stays a whole mushaf line on a glass plate,
 * with the word cells beneath it.
 *
 * One plate per ayah rather than one card per word -- that is the difference
 * from the grid this replaces, and the reason the ayah still reads as a verse.
 *
 * The cells wrap. The mockup drew them as a horizontal rail instead, showing
 * "the neighbourhood, not the whole ayah" in its own words; both shipped to the
 * device and the owner rejected the rail on sight (2026-08-25) -- ugly and
 * confusing, three cells at a time behind a sideways swipe. Do not bring it
 * back from the mockup.
 */
export function WbwHybrid({ page, uiLocale, glosses, onWordPress }: WbwHybridProps) {
  const cells = page.words.map((word) => (
    <WbwCell
      key={word.id}
      word={word}
      // This word's own segments and this word's own gloss. Handing every cell
      // the whole ayah's segments or the surah's whole gloss map looks entirely
      // plausible on screen -- the grid this replaces carried the same warning.
      segments={page.segments.get(word.id) ?? []}
      gloss={glosses.get(word.id) ?? null}
      onPress={() => onWordPress(word)}
    />
  ));

  return (
    <View style={{ paddingVertical: 10, gap: 12 }}>
      <GlassSurface style={{ marginHorizontal: 14, padding: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <AyahMedallion n={page.ayahNumber} uiLocale={uiLocale} />
        </View>
        <WbwAyahLine page={page} />
      </GlassSurface>
      <View
        testID="wbw-wrap"
        style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14 }}
      >
        {cells}
      </View>
    </View>
  );
}
