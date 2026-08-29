import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
import type { Gloss, WbwPage } from '@/data/corpusRepository';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    Pressable: host('button'),
    ScrollView: host('div'),
    Text: host('span'),
    View: host('div'),
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
  };
});
// useArabicSizes reads the persisted step; the real store opens expo-secure-store.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ arabicScale: 'medium', uiLocale: 'en' }) }));

import { WbwDense } from './WbwDense';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function word(id: number, textArabic = `كلمة${id}`): Word {
  return {
    id,
    ayah_id: 1,
    position: id,
    text_arabic: textArabic,
    transliteration: null,
    root: null,
    lemma: null,
    root_buckwalter: null,
    lemma_buckwalter: null,
    pos_tag: 'N',
    morphology_json: null,
    morphology_description: null,
    grammar_arabic: null,
    grammar_note: null,
    audio_url: null,
  };
}

/** form_arabic is always set here: SegmentedWord falls back to a plain
 *  unjoined <Text> the moment any segment is missing its form, so a null-form
 *  fixture would never exercise the joined path at all. */
function segment(wordId: number, posTag: string, formArabic: string): WordSegment {
  return {
    id: wordId * 100,
    word_id: wordId,
    segment_index: 1,
    segment_type: 'stem',
    pos_tag: posTag,
    form_arabic: formArabic,
    form_buckwalter: null,
    features_json: null,
    lemma: null,
    root: null,
  };
}

function page(count: number): WbwPage {
  const words = Array.from({ length: count }, (_, i) => word(i + 1));
  return {
    ayahNumber: 255,
    words,
    segments: new Map(words.map((w) => [w.id, [segment(w.id, 'N', w.text_arabic)]])),
  };
}

/** A word with no analysed segments, which is the corpus's normal state for
 *  some words -- not an error, and not a reason to drop the word. */
function pageWithUnanalysedWord(): WbwPage {
  const words = [word(1), word(2)];
  return {
    ayahNumber: 255,
    words,
    segments: new Map([[1, [segment(1, 'N', words[0]!.text_arabic)]]]),
  };
}

const gloss = (text: string, lang = 'en', isFallback = false): Gloss => ({ text, lang, isFallback });

const GLOSSES = new Map([
  [1, gloss('Allah')],
  [2, gloss('not')],
  [3, gloss('god')],
]);

function renderDense({
  page: wbwPage = page(3),
  glosses = GLOSSES,
  onWordPress = vi.fn(),
}: { page?: WbwPage; glosses?: Map<number, Gloss>; onWordPress?: (word: Word) => void } = {}) {
  const result = render(
    <ThemeContext.Provider value={themeColors.dark}>
      <WbwDense page={wbwPage} uiLocale="en" glosses={glosses} onWordPress={onWordPress} />
    </ThemeContext.Provider>,
  );
  return { ...result, onWordPress };
}

describe('WbwDense', () => {
  afterEach(cleanup);

  it('renders one cell per word, like the hybrid layout', () => {
    renderDense({ page: page(5) });

    // The mockup draws "no god except" as ONE phrase cell. Decision 27 rules
    // that out in every layout, and a phrase-grouped run reads as plausible
    // unless the count is checked against the word list.
    expect(screen.getAllByTestId('wbw-cell')).toHaveLength(5);
  });

  it('colours segments through SegmentedWord', () => {
    // Decision 28 again, and deliberately not shared with the hybrid suite:
    // the two layouts are separate components and a regression in one says
    // nothing about the other.
    renderDense();

    expect(screen.getAllByTestId('segmented-word').length).toBeGreaterThan(0);
  });

  it('clamps the gloss to a single line', () => {
    renderDense({ glosses: new Map([[1, gloss('the Sustainer of all existence, ever-living')]]) });

    // The density mode's whole point. A two-line gloss makes this the hybrid
    // layout with tighter padding.
    expect(screen.getByTestId('wbw-gloss-1').getAttribute('data-lines')).toBe('1');
  });

  it('drops the ayah line and the per-word tag the hybrid layout carries', () => {
    // This is what buys the extra words per screen -- without it "dense" is a
    // spacing tweak.
    renderDense();

    expect(screen.queryByTestId('wbw-ayah-line')).toBeNull();
    expect(screen.queryByTestId('wbw-pos-1')).toBeNull();
  });

  it('keeps a word with no analysed segments', () => {
    renderDense({ page: pageWithUnanalysedWord() });

    // Dropping it silently shortens the ayah, and dense is the layout where a
    // missing word is hardest to notice.
    expect(screen.getAllByTestId('wbw-cell')).toHaveLength(2);
  });

  it('shows each word its own gloss', () => {
    renderDense();

    expect(screen.getByTestId('wbw-gloss-1').textContent).toBe('Allah');
    expect(screen.getByTestId('wbw-gloss-2').textContent).toBe('not');
  });

  it('opens the sheet on a word press', () => {
    const { onWordPress } = renderDense();

    fireEvent.click(screen.getAllByTestId('wbw-cell')[0]!);

    expect(onWordPress).toHaveBeenCalledWith(page(3).words[0]);
  });

  it('orders the run right to left', () => {
    const { container } = renderDense();

    const run = container.querySelector<HTMLElement>('[data-testid="wbw-dense-run"]')!;
    expect(run.style.flexDirection).toBe('row-reverse');
    expect(run.style.flexWrap).toBe('wrap');
  });

  it('marks a gloss that fell back to another language', () => {
    // word_glosses carries no `ru` rows at all, so a reader on Russian gets the
    // English gloss for every word. Unmarked, the screen presents English as
    // Russian -- the defect in #12.
    renderDense({ glosses: new Map([[1, gloss('Allah', 'en', true)]]) });

    expect(screen.getByTestId('gloss-lang-en').textContent).toBe('(en)');
  });

  it('leaves a gloss in the requested language unmarked', () => {
    // The mark has to be absent on the common path, or it is noise rather than
    // information: on English every gloss would carry it.
    renderDense({ glosses: new Map([[1, gloss('Allah', 'en', false)]]) });

    expect(screen.queryByTestId('gloss-lang-en')).toBeNull();
  });
});
