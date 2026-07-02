import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MorphologySummary } from '../components/morphology/MorphologySummary';
import type { Word } from '@quran-corpus/data';

const word: Word = {
  id: 1,
  ayah_id: 1,
  position: 1,
  text_arabic: 'بِسْمِ',
  transliteration: 'bismi',
  root: 'س م و',
  lemma: 'ٱسْم',
  root_buckwalter: 'smw',
  lemma_buckwalter: null,
  pos_tag: 'N',
  morphology_json: null,
  morphology_description: 'prefixed preposition bi + genitive masculine noun',
  grammar_arabic: 'جار ومجرور',
  audio_url: null,
};

describe('MorphologySummary', () => {
  it('renders verbatim morphology description', () => {
    render(<MorphologySummary word={word} />);
    expect(screen.getByText(/prefixed preposition bi/)).toBeInTheDocument();
  });
  it('renders Arabic grammar label', () => {
    render(<MorphologySummary word={word} />);
    expect(screen.getByText('جار ومجرور')).toBeInTheDocument();
  });
  it('renders gloss when provided', () => {
    render(<MorphologySummary word={word} gloss="In (the) name" />);
    expect(screen.getByText('In (the) name')).toBeInTheDocument();
  });
  it('renders POS and root chips', () => {
    render(<MorphologySummary word={word} />);
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByText('س م و')).toBeInTheDocument();
  });
  it('omits description block when null', () => {
    render(<MorphologySummary word={{ ...word, morphology_description: null }} />);
    expect(screen.queryByText(/prefixed preposition/)).toBeNull();
  });
});
