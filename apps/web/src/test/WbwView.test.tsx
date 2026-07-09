import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwView } from '../components/wbw/WbwView';
import type { WbwAyah } from '../components/wbw/types';
import type { Surah } from '@quran-corpus/data';

const surah: Surah = {
  id: 1, name_arabic: 'الفاتحة', name_translit: 'Al-Fatihah', name_translation: 'The Opening',
  revelation_type: 'meccan', ayah_count: 7, order_number: 1,
};
const ayahs: WbwAyah[] = [
  { ayahNumber: 1, cells: [{ surahId: 1, ayahNumber: 1, position: 1, arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition' }], textUthmani: 'x' },
];

describe('WbwView', () => {
  it('renders surah name, a back-to-reader link, and ayah blocks', () => {
    render(<WbwView surah={surah} ayahs={ayahs} page={1} totalPages={1} scrollAyah={null} />);
    expect(screen.getByText('Al-Fatihah')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('href', '/surah/1');
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });

  it('omits the Pager for a single page', () => {
    render(<WbwView surah={surah} ayahs={ayahs} page={1} totalPages={1} scrollAyah={null} />);
    expect(screen.queryByText(/Page 1 \//)).toBeNull();
  });
});
