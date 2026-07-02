import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DictionaryIndex } from '../components/dictionary/DictionaryIndex';
import type { Root } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const roots: Root[] = [
  { id: 1, root_buckwalter: 'ktb', root_arabic: 'ك ت ب', occurrence_count: 319 },
  { id: 2, root_buckwalter: 'smw', root_arabic: 'س م و', occurrence_count: 5 },
];

describe('DictionaryIndex', () => {
  it('renders a row per root', () => {
    render(<DictionaryIndex roots={roots} sort="alpha" />);
    expect(
      screen
        .getAllByRole('link')
        .filter((l) => l.getAttribute('href')?.startsWith('/dictionary/')),
    ).toHaveLength(4);
  });
  it('links to the frequency + verb-concordance tools', () => {
    render(<DictionaryIndex roots={roots} sort="alpha" />);
    expect(screen.getByRole('link', { name: /lemma frequency/i })).toHaveAttribute(
      'href',
      '/dictionary/lemma-frequency',
    );
    expect(screen.getByRole('link', { name: /verb concordance/i })).toHaveAttribute(
      'href',
      '/dictionary/verb-concordance',
    );
  });
  it('shows results header when query set', () => {
    render(<DictionaryIndex roots={roots} sort="alpha" query="ktb" />);
    expect(screen.getByText(/results for/i)).toBeInTheDocument();
  });
});
