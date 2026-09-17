import { View } from 'react-native';
import { groupByGlossSpan, type Word } from '@quran-corpus/data/mobile';
import type { Gloss, WbwPage } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';

import { AyahMedallion } from './AyahMedallion';
import { GlassSurface } from './GlassSurface';
import { WbwCell } from './WbwCell';
import { WbwSpan } from './WbwSpan';

export interface WbwDenseProps {
  page: WbwPage;
  uiLocale: UiLocaleCode;
  /** Keyed by `word.id`, the whole surah's map -- see getSurahGlosses. */
  glosses: Map<number, Gloss>;
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
 * The mockup grouped "لَآ إِلَٰهَ إِلَّا / no god except" into a single phrase
 * cell and decision 27 ruled that out -- one cell per word, in every layout.
 * The owner reversed that on 2026-09-16, once M9 gave the merge a source:
 * Tasnim's `gloss_group` says which words share a gloss, which the mockup was
 * only guessing at. One cell per word still holds INSIDE a span; see WbwSpan.
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
        {groupByGlossSpan(page.words, (word) => glosses.get(word.id)?.group ?? null).map(
          (span) => {
            const first = span[0]!;
            // This word's own segments and gloss -- see the note in WbwHybrid.
            if (span.length === 1) {
              return (
                <WbwCell
                  key={first.id}
                  word={first}
                  segments={page.segments.get(first.id) ?? []}
                  gloss={glosses.get(first.id) ?? null}
                  uiLocale={uiLocale}
                  showPos={false}
                  glossLines={1}
                  compact
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
                showPos={false}
                glossLines={1}
                compact
                onWordPress={onWordPress}
              />
            );
          },
        )}
      </View>
    </GlassSurface>
  );
}
