import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwWordCell } from '../components/wbw/WbwWordCell';
import type { WbwCell } from '../components/wbw/types';

function cell(over: Partial<WbwCell> = {}): WbwCell {
  return {
    surahId: 1, ayahNumber: 1, position: 1,
    arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', posLabel: 'Preposition',
    ...over,
  };
}

describe('WbwWordCell', () => {
  it('renders arabic, translit, gloss, POS label', () => {
    render(<WbwWordCell cell={cell()} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
    expect(screen.getByText("bis'mi")).toBeInTheDocument();
    expect(screen.getByText('In (the) name')).toBeInTheDocument();
    expect(screen.getByText('Preposition')).toBeInTheDocument();
  });

  it('links to the word detail page', () => {
    render(<WbwWordCell cell={cell({ surahId: 2, ayahNumber: 255, position: 1 })} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/word/2/255/1');
  });

  it('shows em dash for null translit/gloss and hides chip when posLabel null', () => {
    render(<WbwWordCell cell={cell({ translit: null, gloss: null, posLabel: null })} />);
    expect(screen.getAllByText('—').length).toBe(2);
    expect(screen.queryByText('Preposition')).toBeNull();
  });
});
