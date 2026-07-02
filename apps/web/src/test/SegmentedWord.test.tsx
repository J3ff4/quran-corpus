import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentedWord } from '../components/morphology/SegmentedWord';
import type { Word, WordSegment } from '@quran-corpus/data';

const word = { id: 1, text_arabic: 'بِسْمِ', pos_tag: 'N' } as Word;
const segments: WordSegment[] = [
  {
    id: 1,
    word_id: 1,
    segment_index: 0,
    segment_type: 'prefix',
    pos_tag: 'P',
    form_arabic: 'بِ',
    form_buckwalter: 'bi',
    features_json: null,
    lemma: null,
    root: null,
  },
  {
    id: 2,
    word_id: 1,
    segment_index: 1,
    segment_type: 'stem',
    pos_tag: 'N',
    form_arabic: 'سْمِ',
    form_buckwalter: 'somi',
    features_json: null,
    lemma: null,
    root: 'smw',
  },
];

describe('SegmentedWord', () => {
  it('renders a colored tspan per segment', () => {
    const { container } = render(<SegmentedWord word={word} segments={segments} />);
    const tspans = container.querySelectorAll('tspan');
    expect(tspans).toHaveLength(2);
    expect(tspans[0]).toHaveTextContent('بِ');
    expect(tspans[0]?.getAttribute('fill')).not.toBe(tspans[1]?.getAttribute('fill'));
  });
  it('renders a POS label per segment', () => {
    render(<SegmentedWord word={word} segments={segments} />);
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });
  it('exposes full word + kept as real text (searchable)', () => {
    const { container } = render(<SegmentedWord word={word} segments={segments} />);
    expect(container.textContent).toContain('بِ');
    expect(container.textContent).toContain('سْمِ');
    expect(container.querySelector('title')?.textContent).toContain('بِسْمِ');
  });
  it('degrades to whole word when no segments', () => {
    const { container } = render(<SegmentedWord word={word} segments={[]} />);
    expect(container.querySelector('text')?.textContent).toContain('بِسْمِ');
  });
});
