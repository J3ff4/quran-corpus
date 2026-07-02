import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentCard } from '../components/morphology/SegmentCard';
import type { WordSegment } from '@quran-corpus/data';

const seg: WordSegment = {
  id: 1,
  word_id: 1,
  segment_index: 1,
  segment_type: 'stem',
  pos_tag: 'N',
  form_arabic: 'سْمِ',
  form_buckwalter: 'somi',
  features_json: '{"case":"genitive","gender":"masculine"}',
  lemma: 'ٱسْم',
  root: 'smw',
};

describe('SegmentCard', () => {
  it('renders POS tag', () => {
    render(<SegmentCard segment={seg} index={1} />);
    expect(screen.getByText('N')).toBeInTheDocument();
  });
  it('renders segment type', () => {
    render(<SegmentCard segment={seg} index={1} />);
    expect(screen.getByText(/stem/i)).toBeInTheDocument();
  });
  it('renders parsed features', () => {
    render(<SegmentCard segment={seg} index={1} />);
    expect(screen.getByText(/genitive/)).toBeInTheDocument();
    expect(screen.getByText(/masculine/)).toBeInTheDocument();
  });
  it('handles null/invalid features_json gracefully', () => {
    render(<SegmentCard segment={{ ...seg, features_json: null }} index={1} />);
    expect(screen.getByText('N')).toBeInTheDocument();
  });
});
