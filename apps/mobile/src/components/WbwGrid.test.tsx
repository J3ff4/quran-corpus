import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
import type { WbwPage } from '@/data/corpusRepository';
import { WbwGrid } from './WbwGrid';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    Pressable: host('button'),
    Text: host('span'),
    View: host('div'),
  };
});

const noop = () => {};

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

function segment(wordId: number, posTag: string): WordSegment {
  return {
    id: wordId * 100,
    word_id: wordId,
    segment_index: 1,
    segment_type: 'stem',
    pos_tag: posTag,
    form_arabic: null,
    form_buckwalter: null,
    features_json: null,
    lemma: null,
    root: null,
  };
}

/** `segmentsFor` is a list of word indices; the rest get no segment row at
 *  all, which is the corpus's normal state for a word it has not analysed. */
function page({ words: count, segmentsFor }: { words: number; segmentsFor?: number[] }): WbwPage {
  const words = Array.from({ length: count }, (_, i) => word(i + 1));
  const indices = segmentsFor ?? words.map((_, i) => i);
  return {
    ayahNumber: 1,
    words,
    segments: new Map(
      indices.map((i) => [words[i]!.id, [segment(words[i]!.id, 'N')]]),
    ),
  };
}

/** Both words carry the SAME Arabic, so the only thing that can tell the two
 *  cells apart is the segment each one renders. With distinct word text the
 *  comparison passes even when every cell renders the whole page's map. */
function pageWithDistinctSegments(): WbwPage {
  const words = [word(1, 'كلمة'), word(2, 'كلمة')];
  return {
    ayahNumber: 1,
    words,
    segments: new Map([
      [1, [segment(1, 'N')]],
      [2, [segment(2, 'V')]],
    ]),
  };
}

describe('WbwGrid', () => {
  afterEach(cleanup);

  it('renders one cell per word', () => {
    render(<WbwGrid page={page({ words: 5 })} uiLocale="en" onWordPress={noop} />);

    expect(screen.getAllByTestId('wbw-cell')).toHaveLength(5);
  });

  it("gives each cell its own segments, not the whole page's", () => {
    // getWbwRange returns one segment map per page, keyed by word_id. A cell
    // that renders the map rather than its own entry shows every word in the
    // page the same grammar, and it looks entirely plausible.
    render(<WbwGrid page={pageWithDistinctSegments()} uiLocale="en" onWordPress={noop} />);

    const cells = screen.getAllByTestId('wbw-cell');
    // Named labels, not just "the two differ": the noun cell must not also
    // carry the verb, which is what a whole-map render produces.
    expect(cells[0]!.textContent).toContain('Noun');
    expect(cells[0]!.textContent).not.toContain('Verb');
    expect(cells[1]!.textContent).toContain('Verb');
    expect(cells[1]!.textContent).not.toContain('Noun');
  });

  it('lays cells out as a wrapping row, not one text run', () => {
    // The reader keeps mushaf flow with nested <Text>; the WbW screen is a
    // chip grid by design, so each cell is a real 48dp Pressable with its own
    // accessibility node -- this is the accessible path to the same data.
    const { container } = render(<WbwGrid page={page({ words: 3 })} uiLocale="en" onWordPress={noop} />);

    const row = container.querySelector<HTMLElement>('[data-testid="wbw-row"]')!;
    expect(row.style.flexWrap).toBe('wrap');
  });

  it('orders cells right to left', () => {
    // Arabic reads RTL and the cells are laid out by flexbox, not by a text
    // engine, so nothing else puts word 1 on the right.
    const { container } = render(<WbwGrid page={page({ words: 3 })} uiLocale="en" onWordPress={noop} />);

    const row = container.querySelector<HTMLElement>('[data-testid="wbw-row"]')!;
    expect(row.style.flexDirection).toBe('row-reverse');
  });

  it('gives every cell a 48dp target', () => {
    render(<WbwGrid page={page({ words: 3 })} uiLocale="en" onWordPress={noop} />);

    for (const cell of screen.getAllByTestId('wbw-cell')) {
      expect(Number(cell.style.minHeight.replace('px', ''))).toBeGreaterThanOrEqual(48);
    }
  });

  it('renders a word with no segments rather than dropping it', () => {
    render(<WbwGrid page={page({ words: 3, segmentsFor: [0, 2] })} uiLocale="en" onWordPress={noop} />);

    expect(screen.getAllByTestId('wbw-cell')).toHaveLength(3);
  });

  it('passes the tapped word up, not its index', () => {
    const onWordPress = vi.fn();
    render(<WbwGrid page={page({ words: 3 })} uiLocale="en" onWordPress={onWordPress} />);

    fireEvent.click(screen.getAllByTestId('wbw-cell')[1]!);

    expect(onWordPress).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });
});
