import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurahCard } from '../components/surah-list/SurahCard';
import type { Surah } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const surah: Surah = {
  id: 1,
  name_arabic: 'الفاتحة',
  name_translit: 'Al-Fatihah',
  name_translation: 'The Opening',
  revelation_type: 'meccan',
  ayah_count: 7,
  order_number: 1,
};

describe('SurahCard', () => {
  it('renders surah number', () => {
    render(<SurahCard surah={surah} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders Arabic name', () => {
    render(<SurahCard surah={surah} />);
    expect(screen.getByText('الفاتحة')).toBeInTheDocument();
  });

  it('renders transliterated name', () => {
    render(<SurahCard surah={surah} />);
    expect(screen.getByText('Al-Fatihah')).toBeInTheDocument();
  });

  it('renders ayah count', () => {
    render(<SurahCard surah={surah} />);
    expect(screen.getByText('7 ayahs')).toBeInTheDocument();
  });

  it('renders revelation type capitalised', () => {
    render(<SurahCard surah={surah} />);
    expect(screen.getByText(/Meccan/)).toBeInTheDocument();
  });

  it('wraps in a link to /surah/1', () => {
    render(<SurahCard surah={surah} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/surah/1');
  });
});
