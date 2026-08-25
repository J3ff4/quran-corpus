import { View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { WbwPage } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';

import { AyahMedallion } from './AyahMedallion';
import { GlassSurface } from './GlassSurface';
import { WbwCell } from './WbwCell';

export interface WbwDenseProps {
  page: WbwPage;
  uiLocale: UiLocaleCode;
  /** Keyed by `word.id`, the whole surah's map -- see getSurahGlosses. */
  glosses: Map<number, string>;
  onWordPress: (word: Word) => void;
}

/**
 * The `2d` dense layout: a tight interlinear run, each word directly above its
 * gloss, no ayah line and no card per word.
 *
 * Roughly double the words per screen, which is the entire point of the second
 * density -- so the gloss is clamped to one line and the cells lose their
 * border. A two-line gloss here makes this the hybrid layout with less padding.
 *
 * The mockup groups "لَآ إِلَٰهَ إِلَّا / no god except" into a single phrase
 * cell. Decision 27 rules that out: one cell per word, in every layout.
 */
export function WbwDense({ page, uiLocale, glosses, onWordPress }: WbwDenseProps) {
  return (
    <GlassSurface style={{ marginHorizontal: 12, marginVertical: 6, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <AyahMedallion n={page.ayahNumber} uiLocale={uiLocale} />
      </View>
      <View
        testID="wbw-dense-run"
        style={{
          flexDirection: 'row-reverse',
          flexWrap: 'wrap',
          justifyContent: 'center',
          columnGap: 11,
          rowGap: 12,
        }}
      >
        {page.words.map((word) => (
          <WbwCell
            key={word.id}
            word={word}
            // This word's own segments and gloss -- see the note in WbwHybrid.
            segments={page.segments.get(word.id) ?? []}
            gloss={glosses.get(word.id) ?? null}
            showPos={false}
            glossLines={1}
            compact
            onPress={() => onWordPress(word)}
          />
        ))}
      </View>
    </GlassSurface>
  );
}
