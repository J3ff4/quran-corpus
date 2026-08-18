import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
import { SegmentedWord } from './SegmentedWord';
import { themeColors } from '@/theme/tokens';
import { rgb } from '@/testing/rgb';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    Text: host('span'),
  };
});

const word: Word = {
  id: 1,
  ayah_id: 1,
  position: 1,
  text_arabic: 'ٱلرَّحْمَٰنِ',
  transliteration: null,
  root: null,
  lemma: null,
  root_buckwalter: null,
  lemma_buckwalter: null,
  pos_tag: null,
  morphology_json: null,
  morphology_description: null,
  grammar_arabic: null,
  grammar_note: null,
  audio_url: null,
};

const ZWJ = '\u200D';

const PREFIX_ARABIC = 'ٱل';
const STEM_ARABIC = 'رَّحْمَٰنِ';

function segment(id: number, posTag: string, formArabic: string | null): WordSegment {
  return {
    id,
    word_id: word.id,
    segment_index: id,
    segment_type: null,
    pos_tag: posTag,
    form_arabic: formArabic,
    form_buckwalter: null,
    features_json: null,
    lemma: null,
    root: null,
  };
}

const prefix = (posTag: string) => segment(1, posTag, PREFIX_ARABIC);
const stem = (posTag: string) => segment(2, posTag, STEM_ARABIC);
const noArabic = (posTag: string) => segment(3, posTag, null);

describe('SegmentedWord', () => {
  afterEach(cleanup);

  it('paints each segment in its part-of-speech colour', () => {
    render(<SegmentedWord word={word} segments={[prefix('P'), stem('N')]} fontSize={36} />);

    const runs = screen.getAllByTestId('segment-run');
    expect(runs).toHaveLength(2);
    expect(runs[0]!.style.color).toBe(rgb(themeColors.light.pos.prep));
    expect(runs[1]!.style.color).toBe(rgb(themeColors.light.pos.noun));
  });

  it('falls back to the whole word when a segment has no Arabic', () => {
    // A partial word is worse than an uncoloured one: the reader would see the
    // word with a piece missing and no sign that anything was dropped.
    render(<SegmentedWord word={word} segments={[prefix('P'), noArabic('N')]} fontSize={36} />);

    expect(screen.queryAllByTestId('segment-run')).toHaveLength(0);
    expect(screen.getByTestId('word-fallback').textContent).toBe(word.text_arabic);
  });

  it('renders the fallback when the word has no segments at all', () => {
    render(<SegmentedWord word={word} segments={[]} fontSize={36} />);

    expect(screen.getByTestId('word-fallback').textContent).toBe(word.text_arabic);
  });

  it('joins segments with no separator, so Arabic letters can join', () => {
    // Adjacent inline runs of one text node, not a space-joined or
    // wrapper-boxed list -- a gap here breaks Arabic letter shaping. The only
    // thing between two runs is a zero-width joiner.
    render(<SegmentedWord word={word} segments={[prefix('P'), stem('N')]} fontSize={36} />);

    const rendered = screen.getByTestId('segmented-word').textContent ?? '';

    expect(rendered.split(ZWJ).join('')).toBe(PREFIX_ARABIC + STEM_ARABIC);
  });

  it('shapes the runs for Android instead of printing the raw segment forms', () => {
    // Without this the lam of the prefix is drawn in its final form and the
    // stem's first letter isolated, which is the word coming apart on screen.
    render(<SegmentedWord word={word} segments={[prefix('P'), stem('N')]} fontSize={36} />);

    const runs = screen.getAllByTestId('segment-run');

    expect(runs[0]!.textContent).toBe(`${PREFIX_ARABIC}${ZWJ}`);
    expect(runs[1]!.textContent).toBe(`${ZWJ}${STEM_ARABIC}`);
  });

  it('gives the whole word one accessible name instead of one per segment', () => {
    render(<SegmentedWord word={word} segments={[prefix('P'), stem('N')]} fontSize={36} />);

    expect(screen.getByLabelText(word.text_arabic)).toBeTruthy();
  });

  it('renders DET without a bucket colour, same as the pill', () => {
    render(<SegmentedWord word={word} segments={[prefix('DET'), stem('N')]} fontSize={36} />);

    const runs = screen.getAllByTestId('segment-run');
    expect(runs[0]!.style.color).not.toBe(rgb(themeColors.light.pos.other));
    expect(runs[0]!.style.color).toBe(rgb(themeColors.light.text));
  });
});
