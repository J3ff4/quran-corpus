import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data/mobile';
import { AlphabetGrid } from './AlphabetGrid';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Pressable: host('button'), Text: host('span'), View: host('div') };
});

describe('AlphabetGrid', () => {
  afterEach(cleanup);

  it('renders every letter the shared order carries', () => {
    render(<AlphabetGrid onSelect={() => {}} />);

    // Driven off the shared constant, not a literal: a grid with its own copy
    // of the alphabet drifts from the buckets rootFirstLetter assigns.
    expect(screen.getAllByTestId('alphabet-cell')).toHaveLength(ARABIC_ALPHABET_ORDER.length);
  });

  it('reports the tapped letter', () => {
    const onSelect = vi.fn();
    render(<AlphabetGrid onSelect={onSelect} />);

    fireEvent.click(screen.getAllByTestId('alphabet-cell')[1]!);

    expect(onSelect).toHaveBeenCalledWith(ARABIC_ALPHABET_ORDER[1]);
  });
});
