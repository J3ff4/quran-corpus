import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DecodedSegment } from '@quran-corpus/data';
import { SegmentCard } from '../components/morphology/SegmentCard';

function decoded(over: Partial<DecodedSegment> = {}): DecodedSegment {
  return {
    role: 'stem',
    pos: { code: 'N', en: 'Noun', ar: 'اسم' },
    features: [],
    unknownTags: [],
    ...over,
  };
}

describe('SegmentCard', () => {
  it('renders role and POS English + Arabic labels', () => {
    render(<SegmentCard segment={decoded({ role: 'prefix' })} index={0} />);
    expect(screen.getByText(/prefix/i)).toBeInTheDocument();
    expect(screen.getByText('Noun')).toBeInTheDocument();
    expect(screen.getByText('اسم')).toBeInTheDocument();
  });

  it('renders labeled features and plain feature chips', () => {
    render(
      <SegmentCard
        index={0}
        segment={decoded({
          features: [
            { key: 'case', label: 'Case', value: 'Genitive' },
            { key: 'feature', label: '', value: 'Perfect' },
          ],
        })}
      />,
    );
    expect(screen.getByText('Case')).toBeInTheDocument();
    expect(screen.getByText('Genitive')).toBeInTheDocument();
    expect(screen.getByText('Perfect')).toBeInTheDocument();
  });

  it('renders unknown tags verbatim as fallback chips', () => {
    render(<SegmentCard index={0} segment={decoded({ unknownTags: ['ZZZ'] })} />);
    expect(screen.getByText('ZZZ')).toBeInTheDocument();
  });

  it('renders Arabic root and lemma when present', () => {
    render(
      <SegmentCard index={0} segment={decoded({ rootArabic: 'سمو', lemma: 'ٱسْم' })} />,
    );
    expect(screen.getByText('سمو')).toBeInTheDocument();
    expect(screen.getByText('ٱسْم')).toBeInTheDocument();
  });
});
