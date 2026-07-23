import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import type { WordDetail, Word, WordSegment } from '@quran-corpus/data';
import { WordDetailView } from '../components/morphology/WordDetailView';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
// FullAnalysis is a client component with framer — stub to a plain always-open box.
vi.mock('../components/morphology/FullAnalysis', () => ({
  FullAnalysis: ({ description, grammarNote }: { description?: string; grammarNote?: string }) => (
    <div data-testid="full-analysis">{description}{grammarNote}</div>
  ),
}));

const baseWord: Word = {
  id: 1, ayah_id: 1, position: 1, text_arabic: 'بِسْمِ',
  transliteration: 'bismi', root: 'س م و', lemma: 'ٱسْم',
  root_buckwalter: 'smw', lemma_buckwalter: null, pos_tag: 'N',
  morphology_json: null, morphology_description: 'In the name — genitive noun.',
  grammar_arabic: null, grammar_note: 'جار ومجرور', audio_url: null,
};

function segment(over: Partial<WordSegment>): WordSegment {
  return {
    id: 1, word_id: 1, segment_index: 0, segment_type: 'stem', pos_tag: 'N',
    form_arabic: null, form_buckwalter: null, features_json: null,
    lemma: null, root: null, ...over,
  };
}

function detail(segments: WordSegment[]): WordDetail {
  return { word: baseWord, segments, concept_tags: [] };
}

describe('WordDetailView', () => {
  it('decodes segments into cards with human POS labels', () => {
    render(<WordDetailView detail={detail([segment({ pos_tag: 'P' })])} />);
    expect(screen.getByText('Preposition')).toBeInTheDocument();
  });

  it('omits the Segments section when there are no segments', () => {
    render(<WordDetailView detail={detail([])} />);
    expect(screen.queryByRole('heading', { name: /segments/i })).not.toBeInTheDocument();
  });

  it('passes scraped prose + Arabic grammar note to FullAnalysis', () => {
    render(<WordDetailView detail={detail([])} />);
    const fa = screen.getByTestId('full-analysis');
    expect(fa).toHaveTextContent('In the name — genitive noun.');
    expect(fa).toHaveTextContent('جار ومجرور');
  });

  it('renders a link to the root in the dictionary when rootHref is given', () => {
    render(<WordDetailView detail={detail([])} rootHref="/dictionary/smw" />);
    const link = screen.getByRole('link', { name: /view root in dictionary/i });
    expect(link).toHaveAttribute('href', '/dictionary/smw');
  });

  it('renders concept tag labels when concept_tags are present', () => {
    const withTags: WordDetail = {
      word: baseWord,
      segments: [],
      concept_tags: [{ id: 1, word_id: 1, tag_label: 'Allah', tag_type: 'named-entity' }],
    };
    render(<WordDetailView detail={withTags} />);
    expect(screen.getByText('Allah')).toBeInTheDocument();
  });

  it('renders the SegmentedWord heading with the word Arabic text', () => {
    render(<WordDetailView detail={detail([])} />);
    expect(screen.getByRole('img', { name: baseWord.text_arabic })).toBeInTheDocument();
  });
});
