import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurahHeader } from '../components/reader/SurahHeader';
import type { Surah } from '@quran-corpus/data';

const surah: Surah = {
  id: 2, name_arabic: 'البقرة', name_translit: 'Al-Baqarah', name_translation: 'The Cow',
  revelation_type: 'medinan', ayah_count: 286, order_number: 2,
};

describe('SurahHeader', () => {
  it('links to the word-by-word page', () => {
    render(<SurahHeader surah={surah} />);
    expect(screen.getByRole('link', { name: /word by word/i })).toHaveAttribute('href', '/surah/2/words');
  });
});
