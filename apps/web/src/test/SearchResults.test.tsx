import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchResults } from '../components/search/SearchResults';
import type { SearchResult } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const base: SearchResult = { jump: null, verses: [], roots: [] };

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
  it('links a jump verse and highlights the target word', () => {
    const jump = {
      surah_id: 1, ayah_number: 1, text_uthmani: 'بِسْمِ ٱللَّهِ',
      words: [{ position: 1, text_arabic: 'بِسْمِ' }, { position: 2, text_arabic: 'ٱللَّهِ' }],
      highlightPosition: 2,
    };
    const { container } = render(<SearchResults result={{ ...base, jump }} />);
    expect(screen.getByRole('link', { name: /1:1/ })).toHaveAttribute('href', '/surah/1');
    expect(container.querySelector('mark')!.textContent).toBe('ٱللَّهِ');
  });
  it('renders a surah-level jump link when ayah is null', () => {
    const jump = { surah_id: 2, ayah_number: null, text_uthmani: '', words: [], highlightPosition: null };
    render(<SearchResults result={{ ...base, jump }} />);
    expect(screen.getByRole('link', { name: /surah 2/i })).toHaveAttribute('href', '/surah/2');
  });
  it('shows an empty state when nothing matches', () => {
    render(<SearchResults result={base} />);
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });
});
