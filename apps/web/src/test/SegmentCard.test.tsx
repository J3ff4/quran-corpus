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

  it('colors the English POS label from its tag, leaving the Arabic label neutral', () => {
    render(<SegmentCard index={0} segment={decoded({ pos: { code: 'P', en: 'Preposition', ar: 'حرف جر' } })} />);
    expect(screen.getByText('Preposition')).toHaveStyle({ color: 'var(--pos-prep)' });
    // The Arabic label is the same fact in another language, not a second
    // category -- coloring it too just doubles the noise per card.
    expect(screen.getByText('حرف جر').getAttribute('style')).toBeNull();
  });

  it('drops only the color for a tag with no color (DET), keeping size and weight', () => {
    // posColor returns null for DET on purpose (corpus.quran.com doesn't treat
    // an assimilated determiner as its own category). It must not fall back to
    // the filled `chip`: a fill outweighs plain text, which would make the one
    // non-category the loudest label in the list.
    render(<SegmentCard index={0} segment={decoded({ pos: { code: 'DET', en: 'Determiner' } })} />);
    const label = screen.getByText('Determiner');
    expect(label.getAttribute('style')).toBeNull();
    // Any paper fill, not just the `chip` helper's current bg-paper-200 -- the
    // rule is "no fill", so a later bg-paper-100 must fail this too.
    expect(label.className).not.toMatch(/\bbg-paper-\d+\b/);
    expect(label.className).toContain('text-sm font-medium');
  });

  it('renders Arabic root and lemma when present', () => {
    render(
      <SegmentCard index={0} segment={decoded({ rootArabic: 'سمو', lemma: 'ٱسْم' })} />,
    );
    expect(screen.getByText('سمو')).toBeInTheDocument();
    expect(screen.getByText('ٱسْم')).toBeInTheDocument();
  });
});
