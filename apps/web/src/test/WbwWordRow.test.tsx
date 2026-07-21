import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwWordRow } from '../components/wbw/WbwWordRow';
import type { WbwCell } from '../components/wbw/types';

function cell(over: Partial<WbwCell> = {}): WbwCell {
  return {
    surahId: 1, ayahNumber: 1, position: 1,
    arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition',
    morphologyDescription: 'P – prefixed preposition bi', grammarArabic: 'جار ومجرور',
    ...over,
  };
}

function renderRow(cellProps: WbwCell, pageLang?: string) {
  return render(
    <table>
      <tbody>
        <WbwWordRow cell={cellProps} {...(pageLang ? { pageLang } : {})} />
      </tbody>
    </table>,
  );
}

describe('WbwWordRow', () => {
  it('renders translation, arabic, and morphology columns', () => {
    renderRow(cell());
    expect(screen.getByText('In (the) name')).toBeInTheDocument();
    expect(screen.getByText("bis'mi")).toBeInTheDocument();
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
    expect(screen.getByText('Preposition')).toBeInTheDocument();
    expect(screen.getByText('P – prefixed preposition bi')).toBeInTheDocument();
    expect(screen.getByText('جار ومجرور')).toBeInTheDocument();
    expect(screen.getByText('(1:1:1)')).toBeInTheDocument();
  });

  it('links the arabic word to the word detail page', () => {
    renderRow(cell({ surahId: 2, ayahNumber: 255, position: 1 }));
    expect(screen.getByRole('link')).toHaveAttribute('href', '/word/2/255/1');
  });

  it('shows em dash for null translit/gloss/morphologyDescription/grammarArabic', () => {
    renderRow(
      cell({ translit: null, gloss: null, posLabel: null, morphologyDescription: null, grammarArabic: null }),
    );
    expect(screen.getAllByText('—').length).toBe(4);
    expect(screen.queryByText('جار ومجرور')).toBeNull();
  });

  it('marks an EN-fallback gloss while viewing uz, same as the card cell', () => {
    renderRow(cell({ gloss: 'Allah', glossLang: 'en' }), 'uz');
    expect(screen.getByText(/\(en\)/i)).toBeInTheDocument();
  });
});
