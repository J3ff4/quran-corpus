import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Word } from '@quran-corpus/data';
import { MorphologySummary } from '../components/morphology/MorphologySummary';

function word(over: Partial<Word> = {}): Word {
  return {
    id: 1, ayah_id: 1, position: 1, text_arabic: 'بِسْمِ',
    transliteration: 'bismi', root: 'س م و', lemma: 'ٱسْم',
    root_buckwalter: 'smw', lemma_buckwalter: null, pos_tag: 'N',
    morphology_json: null, morphology_description: 'PROSE HERE',
    grammar_arabic: 'ARABIC HERE', audio_url: null, ...over,
  };
}

describe('MorphologySummary (trimmed)', () => {
  it('renders transliteration, gloss, and POS/root/lemma chips', () => {
    render(<MorphologySummary word={word()} gloss="In the name" />);
    expect(screen.getByText('bismi')).toBeInTheDocument();
    expect(screen.getByText('In the name')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('no longer renders verbatim prose or Arabic grammar (moved to FullAnalysis)', () => {
    render(<MorphologySummary word={word()} />);
    expect(screen.queryByText('PROSE HERE')).not.toBeInTheDocument();
    expect(screen.queryByText('ARABIC HERE')).not.toBeInTheDocument();
  });
});
