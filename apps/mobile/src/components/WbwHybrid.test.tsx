import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
import type { WbwPage } from '@/data/corpusRepository';

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

import { WbwHybrid } from './WbwHybrid';
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

const GLOSSES = new Map([
  [1, 'Allah'],
  [2, 'not'],
  [3, 'god'],
]);

function renderHybrid({
  page: wbwPage = page(3),
  glosses = GLOSSES,
  rail = false,
  onWordPress = vi.fn(),
}: { page?: WbwPage; glosses?: Map<number, string>; rail?: boolean; onWordPress?: (word: Word) => void } = {}) {
  const result = render(
    <ThemeContext.Provider value={themeColors.dark}>
      <WbwHybrid page={wbwPage} uiLocale="en" glosses={glosses} rail={rail} onWordPress={onWordPress} />
    </ThemeContext.Provider>,
  );
  return { ...result, onWordPress };
}

describe('WbwHybrid', () => {
  afterEach(cleanup);

  it('renders one cell per word, in mushaf order', () => {
    renderHybrid({ page: page(5) });

    // Decision 27. Grouping "Allahu la ilaha" into one phrase cell is the
    // design the owner rejected, and it reads as plausible unless the count is
    // checked against the word list.
    const cells = screen.getAllByTestId('wbw-cell');
    expect(cells).toHaveLength(5);
    expect(cells[0]?.getAttribute('aria-label')).toBe('كلمة1');
  });

  it('colours segments through SegmentedWord, not by nesting Text itself', () => {
    renderHybrid();

    // Decision 28. SegmentedWord is what applies joinSegmentRuns; a layout that
    // nests its own coloured <Text> renders each segment as a separate shaping
    // run and the word comes apart on Android -- correct in this DOM shim,
    // broken on the device.
    expect(screen.getAllByTestId('segmented-word').length).toBeGreaterThan(0);
  });

  it('keeps the ayah as one continuous line above the cells', () => {
    // The hybrid half of 2c: what 2d drops and the old grid never had. One
    // outer <Text> per ayah, because Android only line-breaks a single run.
    renderHybrid();

    expect(screen.getByTestId('wbw-ayah-line').textContent).toBe('كلمة1 كلمة2 كلمة3');
  });

  it("gives each cell its own segments, not the whole page's", () => {
    // getWbwRange returns one segment map per page, keyed by word_id. A cell
    // that renders the map rather than its own entry draws every word as the
    // same word, and the fixture's forms are what make that visible.
    renderHybrid();

    const cells = screen.getAllByTestId('wbw-cell');
    expect(cells[0]!.textContent).toContain('كلمة1');
    expect(cells[0]!.textContent).not.toContain('كلمة2');
    expect(cells[1]!.textContent).toContain('كلمة2');
  });

  it('shows each word its own gloss', () => {
    renderHybrid();

    // The same "plausible but wrong" hazard as the segments above: handing
    // every cell the surah's whole gloss map looks fine on screen.
    expect(screen.getByTestId('wbw-gloss-1').textContent).toBe('Allah');
    expect(screen.getByTestId('wbw-gloss-2').textContent).toBe('not');
  });

  it('opens the sheet on a word press', () => {
    const { onWordPress } = renderHybrid();

    fireEvent.click(screen.getAllByTestId('wbw-cell')[0]!);

    expect(onWordPress).toHaveBeenCalledWith(page(3).words[0]);
  });

  it('keeps a word with no analysed segments', () => {
    renderHybrid({ page: pageWithUnanalysedWord() });

    // Dropping it silently shortens the ayah, and nothing on screen says so.
    expect(screen.getAllByTestId('wbw-cell')).toHaveLength(2);
  });

  it('wraps the cells and orders them right to left', () => {
    const { container } = renderHybrid();

    expect(screen.queryByTestId('wbw-rail')).toBeNull();
    const wrap = container.querySelector<HTMLElement>('[data-testid="wbw-wrap"]')!;
    expect(wrap.style.flexWrap).toBe('wrap');
    // Arabic reads RTL and flexbox lays these out, not a text engine, so
    // nothing else puts word 1 on the right.
    expect(wrap.style.flexDirection).toBe('row-reverse');
  });

  it('puts the cells in a horizontal rail instead when asked', () => {
    const { container } = renderHybrid({ rail: true });

    // Mockup 2c's rail. Without the horizontal flag this is the wrapped
    // layout with a different testID -- the flag is the layout.
    const rail = container.querySelector<HTMLElement>('[data-testid="wbw-rail"]')!;
    expect(rail.getAttribute('data-horizontal')).toBe('true');
    expect(screen.queryByTestId('wbw-wrap')).toBeNull();
    expect(screen.getAllByTestId('wbw-cell')).toHaveLength(3);
  });

  it('gives the rail cells a fixed width so one long gloss cannot widen a cell', () => {
    renderHybrid({ rail: true, glosses: new Map([[1, 'a very long gloss indeed'], [2, 'not']]) });

    const cells = screen.getAllByTestId('wbw-cell');
    expect(cells[0]!.style.width).toBe(cells[1]!.style.width);
    expect(cells[0]!.style.width).not.toBe('');
  });
});
