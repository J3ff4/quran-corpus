import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwAyahListBlock } from '../components/wbw/WbwAyahListBlock';
import type { WbwAyah } from '../components/wbw/types';

const c = (position: number, arabic: string) => ({
  surahId: 1, ayahNumber: 3, position, arabic, translit: 't', gloss: 'g', glossLang: null, posLabel: 'Noun',
  segments: [],
  morphologyDescription: 'N – nominative masculine noun', grammarArabic: 'اسم مرفوع',
});

describe('WbwAyahListBlock', () => {
  it('has scroll anchor id and renders a table row per word', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف'), c(2, 'باء')], textUthmani: 'x' };
    const { container } = render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(container.querySelector('#ayah-3')).not.toBeNull();
    expect(screen.getAllByRole('row').length).toBe(3); // header row + 2 word rows
  });

  it('falls back to text_uthmani when the ayah has no words', () => {
    const ayah: WbwAyah = { ayahNumber: 4, cells: [], textUthmani: 'نَصُّ الآية' };
    render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(screen.getByText('نَصُّ الآية')).toBeInTheDocument();
  });

  it('renders a bookmark button', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'x' };
    render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(screen.getByRole('button', { name: /bookmark ayah 3/i })).toBeInTheDocument();
  });

  it('column headers match the corpus.quran.com layout', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'x' };
    render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(screen.getByRole('columnheader', { name: 'Translation' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Arabic word' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Syntax and morphology' })).toBeInTheDocument();
  });

  it('shows the sajdah mark inside the last row when the ayah is a prostration verse', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف'), c(2, 'باء')], textUthmani: 'نَصّ ۩' };
    render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(screen.getByLabelText('Verse of Prostration (Sajdah)')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(rows[rows.length - 1]).toHaveTextContent('۩');
  });

  it('does not show the sajdah mark otherwise', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'نَصّ' };
    render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(screen.queryByLabelText('Verse of Prostration (Sajdah)')).toBeNull();
  });
});
