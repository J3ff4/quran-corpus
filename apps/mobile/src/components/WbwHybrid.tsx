import { View } from 'react-native';
import { groupByGlossSpan, type Word } from '@quran-corpus/data/mobile';
import type { Gloss, WbwPage } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';

import { AyahMedallion } from './AyahMedallion';
import { GlassSurface } from './GlassSurface';
import { WbwAyahLine } from './WbwAyahLine';
import { WbwCell } from './WbwCell';
import { WbwSpan } from './WbwSpan';

export interface WbwHybridProps {
  page: WbwPage;
  uiLocale: UiLocaleCode;
  /** Keyed by `word.id`, the whole surah's map -- see getSurahGlosses. */
  glosses: Map<number, Gloss>;
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
  // Split into the spans one Tasnim gloss covers before rendering: a phrase
  // gloss belongs to the run, not to each word in it (owner ruling
  // 2026-09-16, reversing decision 27 -- see WbwSpan).
  const cells = groupByGlossSpan(page.words, (word) => glosses.get(word.id)?.group ?? null).map(
    (span) => {
      const first = span[0]!;
      // This word's own segments and this word's own gloss. Handing every cell
      // the whole ayah's segments or the surah's whole gloss map looks entirely
      // plausible on screen -- the grid this replaces carried the same warning.
      if (span.length === 1) {
        return (
          <WbwCell
            key={first.id}
            word={first}
            segments={page.segments.get(first.id) ?? []}
            gloss={glosses.get(first.id) ?? null}
            uiLocale={uiLocale}
            onPress={() => onWordPress(first)}
          />
        );
      }
      return (
        <WbwSpan
          key={first.id}
          words={span}
          gloss={glosses.get(first.id) ?? null}
          segmentsFor={(word) => page.segments.get(word.id) ?? []}
          uiLocale={uiLocale}
          onWordPress={onWordPress}
        />
      );
    },
  );

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
