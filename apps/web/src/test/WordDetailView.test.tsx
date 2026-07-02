import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordDetailView } from '../components/morphology/WordDetailView';
import type { WordDetail } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// Stub the SVG child so this stays a WordDetailView unit test.
vi.mock('../components/morphology/SegmentedWord', () => ({
  SegmentedWord: ({
    word,
    segments,
  }: {
    word: { text_arabic: string };
    segments: unknown[];
  }) => (
    <div data-testid="segmented">
      {word.text_arabic} [{segments.length}]
    </div>
  ),
}));

const detail: WordDetail = {
  word: {
    id: 1,
    ayah_id: 1,
    position: 1,
    text_arabic: 'بِسْمِ',
    transliteration: 'bismi',
    root: 'س م و',
    lemma: null,
    root_buckwalter: 'smw',
    lemma_buckwalter: null,
    pos_tag: 'N',
    morphology_json: null,
    morphology_description: 'prefixed preposition bi + noun',
    grammar_arabic: 'جار ومجرور',
    audio_url: null,
  },
  segments: [
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
      features_json: '{"case":"genitive"}',
      lemma: null,
      root: 'smw',
    },
  ],
  concept_tags: [{ id: 1, word_id: 1, tag_label: 'Allah', tag_type: 'named-entity' }],
};

describe('WordDetailView', () => {
  it('renders the color-coded word heading via SegmentedWord', () => {
    render(<WordDetailView detail={detail} />);
    expect(screen.getByTestId('segmented')).toHaveTextContent('بِسْمِ');
  });
  it('renders one card per segment', () => {
    render(<WordDetailView detail={detail} />);
    // Card labels are "<n>. <segment_type>"; anchor to avoid matching the
    // morphology description prose (e.g. "prefixed …").
    expect(screen.getAllByText(/^\d+\.\s(prefix|stem)$/i).length).toBe(2);
  });
  it('renders concept tags as non-clickable labels', () => {
    render(<WordDetailView detail={detail} />);
    const tag = screen.getByText('Allah');
    expect(tag.closest('a')).toBeNull();
    expect(tag.closest('button')).toBeNull();
  });
  it('renders dictionary root link when rootHref provided', () => {
    render(<WordDetailView detail={detail} rootHref="/dictionary/smw" />);
    expect(screen.getByRole('link', { name: /root/i })).toHaveAttribute('href', '/dictionary/smw');
  });
});
