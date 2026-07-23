import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentPills } from '../components/morphology/SegmentPills';
import type { WordSegment } from '@quran-corpus/data';

function seg(over: Partial<WordSegment> = {}): WordSegment {
  return {
    id: 1, word_id: 1, segment_index: 0, segment_type: 'prefix',
    pos_tag: 'P', form_arabic: 'بِ', form_buckwalter: null,
    features_json: null, lemma: null, root: null,
    ...over,
  };
}

describe('SegmentPills', () => {
  it('falls back to the flat word when segments is empty', () => {
    render(<SegmentPills segments={[]} fallbackWord="بِسْمِ" />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });

  it('renders one pill per segment with its Arabic form and POS code', () => {
    const segments = [
      seg({ id: 1, segment_index: 0, pos_tag: 'P', form_arabic: 'بِ' }),
      seg({ id: 2, segment_index: 1, pos_tag: 'N', form_arabic: 'سْمِ' }),
    ];
    render(<SegmentPills segments={segments} fallbackWord="بِسْمِ" />);
    expect(screen.getByText('بِ')).toBeInTheDocument();
    expect(screen.getByText('سْمِ')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('colors each segment by posColor(pos_tag)', () => {
    const segments = [seg({ id: 1, pos_tag: 'V', form_arabic: 'قُلْ' })];
    render(<SegmentPills segments={segments} fallbackWord="قُلْ" />);
    expect(screen.getByText('قُلْ')).toHaveStyle({ color: 'var(--pos-verb)' });
    expect(screen.getByText('V')).toHaveStyle({ color: 'var(--pos-verb)' });
  });

  it('renders DET glyph as plain text but hides its tag pill entirely', () => {
    const segments = [
      seg({ id: 1, pos_tag: 'DET', form_arabic: 'ٱل' }),
      seg({ id: 2, pos_tag: 'N', form_arabic: 'ْكِتَابُ', segment_index: 1 }),
    ];
    render(<SegmentPills segments={segments} fallbackWord="ٱلْكِتَابُ" />);
    expect(screen.getByText('ٱل')).not.toHaveAttribute('style');
    expect(screen.queryByText('DET')).not.toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('renders empty pos_tag code as empty text without crashing', () => {
    const segments = [seg({ id: 1, pos_tag: null, form_arabic: 'قُلْ' })];
    render(<SegmentPills segments={segments} fallbackWord="قُلْ" />);
    expect(screen.getByText('قُلْ')).toBeInTheDocument();
  });

  it('falls back to the flat word when any segment has a null/empty form_arabic', () => {
    const segments = [
      seg({ id: 1, segment_index: 0, pos_tag: 'P', form_arabic: null }),
      seg({ id: 2, segment_index: 1, pos_tag: 'N', form_arabic: 'سْمِ' }),
    ];
    render(<SegmentPills segments={segments} fallbackWord="بِسْمِ" />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
    expect(screen.queryByText('سْمِ')).not.toBeInTheDocument();
  });
});
