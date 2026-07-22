import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwAyahBlock } from '../components/wbw/WbwAyahBlock';
import type { WbwAyah } from '../components/wbw/types';

const c = (position: number, arabic: string) => ({
  surahId: 1, ayahNumber: 3, position, arabic, translit: 't', gloss: 'g', glossLang: null,
  posTag: 'N', posLabel: 'Noun',
  segments: [],
  grammarArabic: 'اسم مرفوع',
});

describe('WbwAyahBlock', () => {
  it('has scroll anchor id and renders cells', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف'), c(2, 'باء')], textUthmani: 'x' };
    const { container } = render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    expect(container.querySelector('#ayah-3')).not.toBeNull();
    expect(screen.getByText('الف')).toBeInTheDocument();
    expect(screen.getByText('باء')).toBeInTheDocument();
  });

  it('falls back to text_uthmani when the ayah has no words', () => {
    const ayah: WbwAyah = { ayahNumber: 4, cells: [], textUthmani: 'نَصُّ الآية' };
    render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    expect(screen.getByText('نَصُّ الآية')).toBeInTheDocument();
  });

  it('renders cells in ascending position order in the DOM (dir=rtl handles visual order)', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف'), c(2, 'باء')], textUthmani: 'x' };
    render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent('الف');
    expect(links[1]).toHaveTextContent('باء');
  });

  it('renders a bookmark button', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'x' };
    render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    expect(screen.getByRole('button', { name: /bookmark ayah 3/i })).toBeInTheDocument();
  });

  it('shows the sajdah mark when the ayah text contains it', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'نَصّ ۩' };
    render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    expect(screen.getByLabelText('Verse of Prostration (Sajdah)')).toBeInTheDocument();
  });

  it('does not show the sajdah mark otherwise', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'نَصّ' };
    render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    expect(screen.queryByLabelText('Verse of Prostration (Sajdah)')).toBeNull();
  });
});
