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
  it('renders a colored pill per segment, non-overlapping', () => {
    render(<SegmentedWord word={word} segments={segments} />);
    const bi = screen.getByText('بِ');
    const smi = screen.getByText('سْمِ');
    expect(bi).toBeInTheDocument();
    expect(smi).toBeInTheDocument();
    expect(bi.style.color).not.toBe(smi.style.color);
  });
  it('renders a POS label per segment', () => {
    render(<SegmentedWord word={word} segments={segments} />);
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });
  it('exposes one accessible name via role=img while keeping real, searchable text', () => {
    render(<SegmentedWord word={word} segments={segments} gloss="in the name" />);
    expect(screen.getByRole('img', { name: 'بِسْمِ — in the name' })).toBeInTheDocument();
    expect(screen.getByText('بِ')).toBeInTheDocument();
    expect(screen.getByText('سْمِ')).toBeInTheDocument();
  });
  it('degrades to whole word when no segments', () => {
    render(<SegmentedWord word={word} segments={[]} />);
    expect(screen.getByRole('img', { name: 'بِسْمِ' })).toBeInTheDocument();
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });
});
