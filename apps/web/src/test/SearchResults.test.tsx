import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchResults } from '../components/search/SearchResults';
import type { SearchResult } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

const base: SearchResult = { jump: null, verses: [], words: [], roots: [] };

describe('SearchResults', () => {
  it('renders a verse snippet with <mark> around sentinels', () => {
    const result: SearchResult = {
      ...base,
      verses: [{ surah_id: 2, ayah_number: 255, source: 'en', snippet: 'the \u0002throne\u0003 verse' }],
    };
    const { container } = render(<SearchResults result={result} />);
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('throne');
  });
  it('links a verse hit straight to its ayah, not just the surah', () => {
    const result: SearchResult = {
      ...base,
      verses: [{ surah_id: 2, ayah_number: 250, source: 'en', snippet: 'knows' }],
    };
    render(<SearchResults result={result} />);
    expect(screen.getByRole('link', { name: /2:250/ })).toHaveAttribute('href', '/surah/2?ayah=250');
  });
  it('calls onNavigate when a verse hit is clicked', () => {
    const onNavigate = vi.fn();
    const result: SearchResult = {
      ...base,
      verses: [{ surah_id: 2, ayah_number: 250, source: 'en', snippet: 'knows' }],
    };
    render(<SearchResults result={result} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('link', { name: /2:250/ }));
    expect(onNavigate).toHaveBeenCalled();
  });
  it('links a jump verse to its exact ayah and highlights the target word', () => {
    const jump = {
      surah_id: 1, ayah_number: 1, text_uthmani: 'بِسْمِ ٱللَّهِ',
      words: [{ position: 1, text_arabic: 'بِسْمِ' }, { position: 2, text_arabic: 'ٱللَّهِ' }],
      highlightPosition: 2,
    };
    const { container } = render(<SearchResults result={{ ...base, jump }} />);
    expect(screen.getByRole('link', { name: /1:1/ })).toHaveAttribute('href', '/surah/1?ayah=1');
    expect(container.querySelector('mark')!.textContent).toBe('ٱللَّهِ');
  });
  it('renders a surah-level jump link when ayah is null', () => {
    const jump = { surah_id: 2, ayah_number: null, text_uthmani: '', words: [], highlightPosition: null };
    render(<SearchResults result={{ ...base, jump }} />);
    expect(screen.getByRole('link', { name: /surah 2/i })).toHaveAttribute('href', '/surah/2');
  });
  describe('Words section', () => {
    const word = {
      lemma_buckwalter: 'kitaAb',
      arabic: 'كِتَٰب',
      gloss: 'the \u0002book\u0003',
      gloss_lang: null,
      count: 230,
      surah_id: 2,
      ayah_number: 2,
      position: 2,
    };
    it('renders Words between the Verses and Roots headings', () => {
      render(
        <SearchResults
          result={{
            ...base,
            verses: [{ surah_id: 2, ayah_number: 250, source: 'en', snippet: 'knows' }],
            words: [word],
            roots: [{ id: 1, root_buckwalter: 'ktb', root_arabic: 'كتب' }] as SearchResult['roots'],
          }}
        />,
      );
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual(['Verses', 'Words', 'Roots']);
    });
    it('links a lemma row to its lemma page', () => {
      render(<SearchResults result={{ ...base, words: [{ ...word, lemma_buckwalter: '$aTo_#' }] }} />);
      expect(screen.getByRole('link', { name: /book/ })).toHaveAttribute(
        'href',
        '/dictionary/lemma/%24aTo_%23',
      );
    });
    it('links a lemma-less row to its word page', () => {
      render(
        <SearchResults
          result={{ ...base, words: [{ ...word, lemma_buckwalter: null, surah_id: 2, ayah_number: 7, position: 3 }] }}
        />,
      );
      expect(screen.getByRole('link', { name: /book/ })).toHaveAttribute('href', '/word/2/7/3');
    });
    it('gives the count an accessible name', () => {
      render(<SearchResults result={{ ...base, words: [word] }} />);
      // jsdom joins the spans without the space a screen reader hears.
      expect(screen.getByRole('link', { name: /230\s*occurrences/ })).toBeInTheDocument();
    });
    it('wraps the gloss match in a <mark>', () => {
      const { container } = render(<SearchResults result={{ ...base, words: [word] }} />);
      expect(container.querySelector('mark')!.textContent).toBe('book');
    });
    it('tags the gloss language only when gloss_lang is set', () => {
      const { unmount } = render(<SearchResults result={{ ...base, words: [word] }} />);
      // Any parenthesised tag, so an empty "()" for a null language also fails.
      expect(screen.queryByText(/^\(.*\)$/)).toBeNull();
      unmount();
      render(<SearchResults result={{ ...base, words: [{ ...word, gloss_lang: 'ru' }] }} />);
      expect(screen.getByText('(ru)')).toBeInTheDocument();
    });
    it('renders no Words section when words is empty', () => {
      render(
        <SearchResults
          result={{ ...base, verses: [{ surah_id: 2, ayah_number: 250, source: 'en', snippet: 'knows' }] }}
        />,
      );
      expect(screen.queryByRole('heading', { name: 'Words' })).toBeNull();
    });
    it('is not the empty state when only words match', () => {
      const { container } = render(<SearchResults result={{ ...base, words: [word] }} />);
      expect(container).not.toHaveTextContent(/no results/i);
    });
  });
  it('shows an empty state when nothing matches', () => {
    // TypingText renders one span per character; assert on textContent.
    const { container } = render(<SearchResults result={base} />);
    expect(container).toHaveTextContent(/no results/i);
  });
});
