import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConcordanceList } from '../components/dictionary/ConcordanceList';
import type { ConcordanceEntry } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const entries: ConcordanceEntry[] = [
  {
    surah_id: 2,
    ayah_number: 79,
    position: 3,
    word_id: 5,
    text_arabic: 'يَكْتُبُونَ',
    transliteration: 'yaktubūna',
    gloss: 'they write',
    verse_text: 'فَوَيْلٌ ...',
  },
];

describe('ConcordanceList', () => {
  it('renders a ref link per entry', () => {
    render(<ConcordanceList entries={entries} />);
    expect(screen.getByRole('link', { name: /2:79:3/ })).toHaveAttribute('href', '/word/2/79/3');
  });
  it('renders gloss + arabic form', () => {
    render(<ConcordanceList entries={entries} />);
    expect(screen.getByText('they write')).toBeInTheDocument();
    expect(screen.getByText('يَكْتُبُونَ')).toBeInTheDocument();
  });
});
