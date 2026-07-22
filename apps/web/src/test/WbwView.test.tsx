import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

import { WbwView } from '../components/wbw/WbwView';
import type { WbwAyah } from '../components/wbw/types';
import type { Surah } from '@quran-corpus/data';

const surah: Surah = {
  id: 1, name_arabic: 'الفاتحة', name_translit: 'Al-Fatihah', name_translation: 'The Opening',
  revelation_type: 'meccan', ayah_count: 7, order_number: 1,
};
const ayahs: WbwAyah[] = [
  { ayahNumber: 1, cells: [{ surahId: 1, ayahNumber: 1, position: 1, arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition', segments: [], morphologyDescription: 'P', grammarArabic: 'جار ومجرور' }], textUthmani: 'x' },
];

// Al-Baqarah (id 2): not Al-Fatiha/At-Tawba, so Bismillah renders on page 1 only.
const baqarah: Surah = {
  id: 2, name_arabic: 'البقرة', name_translit: 'Al-Baqarah', name_translation: 'The Cow',
  revelation_type: 'medinan', ayah_count: 286, order_number: 2,
};
const midSurahAyahs: WbwAyah[] = [
  { ayahNumber: 16, cells: [{ surahId: 2, ayahNumber: 16, position: 1, arabic: 'أُو۟لَٰٓئِكَ', translit: "ulaaika", gloss: 'Those', glossLang: null, posLabel: 'Pronoun', segments: [], morphologyDescription: null, grammarArabic: null }], textUthmani: 'x' },
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

  it('renders the Bismillah banner on page 1 for a non-Fatiha/Tawba surah', () => {
    render(<WbwView surah={baqarah} ayahs={midSurahAyahs} page={1} totalPages={20} scrollAyah={null} />);
    expect(screen.getByLabelText('Bismillah')).toBeInTheDocument();
  });

  it('does NOT render the Bismillah banner on page 2+ (mid-surah pagination)', () => {
    render(<WbwView surah={baqarah} ayahs={midSurahAyahs} page={2} totalPages={20} scrollAyah={null} />);
    expect(screen.queryByLabelText('Bismillah')).toBeNull();
  });

  it('renders a Go to verse VersePicker when pickerSurahs is provided', () => {
    render(
      <WbwView
        surah={surah}
        ayahs={ayahs}
        page={1}
        totalPages={1}
        scrollAyah={null}
        pickerSurahs={[{ id: 1, name_translit: 'Al-Fatihah', ayah_count: 7 }]}
      />,
    );
    expect(screen.getByLabelText(/surah/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go/i })).toBeInTheDocument();
  });

  it('omits the VersePicker when pickerSurahs is not provided', () => {
    render(<WbwView surah={surah} ayahs={ayahs} page={1} totalPages={1} scrollAyah={null} />);
    expect(screen.queryByLabelText(/surah/i)).toBeNull();
  });
});
