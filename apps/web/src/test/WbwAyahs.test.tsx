import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WbwAyahs } from '../components/wbw/WbwAyahs';
import type { WbwAyah } from '../components/wbw/types';

const ayahs: WbwAyah[] = [
  {
    ayahNumber: 1,
    cells: [
      {
        surahId: 1, ayahNumber: 1, position: 1, arabic: 'بِسْمِ', translit: "bis'mi",
        gloss: 'In (the) name', glossLang: null, posTag: 'P', posLabel: 'Preposition',
        segments: [],
        grammarArabic: 'جار ومجرور',
      },
    ],
    textUthmani: 'x',
  },
];

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = (c.split('=')[0] ?? '').trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  });
}

describe('WbwAyahs', () => {
  afterEach(() => clearCookies());

  it('defaults to card view when initialViewMode is omitted', () => {
    render(<WbwAyahs surahId={1} ayahs={ayahs} />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders card view when initialViewMode is card (SSR-provided)', () => {
    render(<WbwAyahs surahId={1} ayahs={ayahs} initialViewMode="card" />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders list view immediately when initialViewMode is list (SSR-provided, no flash)', () => {
    render(<WbwAyahs surahId={1} ayahs={ayahs} initialViewMode="list" />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('toggling to List switches the render and persists the choice via cookie', () => {
    render(<WbwAyahs surahId={1} ayahs={ayahs} />);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(document.cookie).toContain('wbw-view-mode=list');
  });

  it('toggling back to Card removes the table and persists the choice via cookie', () => {
    render(<WbwAyahs surahId={1} ayahs={ayahs} initialViewMode="list" />);
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(document.cookie).toContain('wbw-view-mode=card');
  });
});
