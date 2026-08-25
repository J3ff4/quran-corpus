import { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { WbwPage } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';

import { AyahMedallion } from './AyahMedallion';
import { GlassSurface } from './GlassSurface';
import { WbwAyahLine } from './WbwAyahLine';
import { WbwCell } from './WbwCell';

/** Mockup 2c's rail cell. Fixed so the rail scrolls by whole cells and so a
 *  long gloss cannot make one cell twice its neighbour's width. */
const RAIL_CELL_WIDTH = 104;

export interface WbwHybridProps {
  page: WbwPage;
  uiLocale: UiLocaleCode;
  /** Keyed by `word.id`, the whole surah's map -- see getSurahGlosses. */
  glosses: Map<number, string>;
  /** true draws mockup 2c's horizontal rail; false wraps every cell instead.
   *  Both are on the device for the owner to choose between; the loser goes. */
  rail?: boolean;
  onWordPress: (word: Word) => void;
}

/**
 * The `2c` hybrid layout: the ayah stays a whole mushaf line on a glass plate,
 * with the word cells beneath it.
 *
 * One plate per ayah rather than one card per word -- that is the difference
 * from the grid this replaces, and the reason the ayah still reads as a verse.
 */
export function WbwHybrid({ page, uiLocale, glosses, rail = false, onWordPress }: WbwHybridProps) {
  const railRef = useRef<ScrollView>(null);
  const cells = page.words.map((word) => (
    <WbwCell
      key={word.id}
      word={word}
      // This word's own segments and this word's own gloss. Handing every cell
      // the whole ayah's segments or the surah's whole gloss map looks entirely
      // plausible on screen -- the grid this replaces carried the same warning.
      segments={page.segments.get(word.id) ?? []}
      gloss={glosses.get(word.id) ?? null}
      width={rail ? RAIL_CELL_WIDTH : undefined}
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
      {rail ? (
        <ScrollView
          testID="wbw-rail"
          ref={railRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          // `row-reverse` puts word 1 at the RIGHT end of the content, which is
          // where an Arabic reader starts -- but a horizontal ScrollView still
          // opens at offset 0, the LEFT end, which is the last word of the
          // ayah. RN has no `inverted` on ScrollView, so jumping to the end
          // once the content is measured is what makes the rail open on word 1.
          onContentSizeChange={() => railRef.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={{ flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 14 }}
        >
          {cells}
        </ScrollView>
      ) : (
        <View
          testID="wbw-wrap"
          style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14 }}
        >
          {cells}
        </View>
      )}
    </View>
  );
}
