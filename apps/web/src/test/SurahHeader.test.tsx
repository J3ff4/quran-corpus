import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurahHeader } from '../components/reader/SurahHeader';
import type { Surah } from '@quran-corpus/data';

const surah: Surah = {
  id: 2, name_arabic: 'البقرة', name_translit: 'Al-Baqarah', name_translation: 'The Cow',
  revelation_type: 'medinan', ayah_count: 286, order_number: 2,
};

const english = { name: 'Al-Baqarah', meaning: 'The Cow' };

describe('SurahHeader', () => {
  it('shows the localized name in the transliteration slot, Arabic still beside it', () => {
    // R5: the localized name REPLACES the transliteration; the Arabic name
    // stays on screen in every locale.
    render(<SurahHeader surah={surah} name={{ name: 'Baqara', meaning: 'Sigir' }} />);
    expect(screen.getByText('Baqara')).toBeInTheDocument();
    expect(screen.getByText('البقرة')).toBeInTheDocument();
    expect(screen.queryByText('Al-Baqarah')).toBeNull();
  });

  it('drops the meaning clause when the locale has none, keeping the rest of the line', () => {
    render(<SurahHeader surah={surah} name={{ name: 'Baqara', meaning: null }} />);
    expect(screen.getByText(/Medinan · 286 ayahs/)).toBeInTheDocument();
    expect(screen.queryByText(/The Cow/)).toBeNull();
  });

  it('links to the word-by-word page', () => {
    render(<SurahHeader surah={surah} name={english} />);
    expect(screen.getByRole('link', { name: /word by word/i })).toHaveAttribute('href', '/surah/2/words');
  });
});
