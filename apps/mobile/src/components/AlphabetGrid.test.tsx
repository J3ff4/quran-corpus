import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data/mobile';
import { AlphabetGrid } from './AlphabetGrid';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Pressable: host('button'), Text: host('span'), View: host('div') };
});

const ALL = new Set(ARABIC_ALPHABET_ORDER);

describe('AlphabetGrid', () => {
  afterEach(cleanup);

  it('renders every letter the shared order carries, under a named group', () => {
    render(<AlphabetGrid uiLocale="en" available={ALL} onSelect={() => {}} />);

    // Driven off the shared constant, not a literal: a grid with its own copy
    // of the alphabet drifts from the buckets rootFirstLetter assigns.
    expect(screen.getAllByTestId('alphabet-cell')).toHaveLength(ARABIC_ALPHABET_ORDER.length);
    // 29 buttons labelled with a bare letter each; the group needs a name.
    expect(screen.getByLabelText('Arabic alphabet')).toBeTruthy();
  });

  it('reports the tapped letter', () => {
    const onSelect = vi.fn();
    render(<AlphabetGrid uiLocale="en" available={ALL} onSelect={onSelect} />);

    fireEvent.click(screen.getAllByTestId('alphabet-cell')[1]!);

    expect(onSelect).toHaveBeenCalledWith(ARABIC_ALPHABET_ORDER[1]);
  });

  it('disables a letter no root is filed under, and only that letter', () => {
    // ء is the shipped DB's one empty bucket and the grid's first cell, so an
    // enabled one makes the first tap in Browse a dead end.
    const available = new Set(ARABIC_ALPHABET_ORDER.slice(1));
    const onSelect = vi.fn();
    render(<AlphabetGrid uiLocale="en" available={available} onSelect={onSelect} />);
    const cells = screen.getAllByTestId('alphabet-cell');

    fireEvent.click(cells[0]!);

    expect(cells[0]!.getAttribute('aria-disabled')).toBe('true');
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(cells[1]!);

    expect(cells[1]!.getAttribute('aria-disabled')).toBe('false');
    expect(onSelect).toHaveBeenCalledWith(ARABIC_ALPHABET_ORDER[1]);
  });

  it('marks the active letter selected, and only that letter', () => {
    render(
      <AlphabetGrid uiLocale="en" available={ALL} activeLetter={ARABIC_ALPHABET_ORDER[1]!} onSelect={() => {}} />,
    );
    const cells = screen.getAllByTestId('alphabet-cell');

    expect(cells[1]!.getAttribute('aria-selected')).toBe('true');
    expect(cells[0]!.getAttribute('aria-selected')).toBe('false');
  });
});
