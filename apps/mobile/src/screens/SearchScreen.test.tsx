import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchScreen } from './SearchScreen';

const mocks = vi.hoisted(() => ({
  searchCorpus: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', contentLanguage: 'ru' }),
}));
vi.mock('@/data/corpusRepository', () => ({ searchCorpus: mocks.searchCorpus }));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
vi.mock('expo-router', () => ({ router: { push: mocks.push } }));

vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  const Input = ({ onChangeText, value, placeholder, testID }: {
    onChangeText?: (text: string) => void;
    value?: string;
    placeholder?: string;
    testID?: string;
  }) =>
    React.createElement('input', {
      'data-testid': testID,
      placeholder,
      value: value ?? '',
      onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
    });
  return {
    ActivityIndicator: host('div'),
    Pressable: host('button'),
    ScrollView: host('div'),
    Text: host('span'),
    TextInput: Input,
    View: host('div'),
  };
});

const EMPTY = { jump: null, verses: [], roots: [] };

describe('SearchScreen', () => {
  beforeEach(() => {
    mocks.searchCorpus.mockReset();
    mocks.push.mockReset();
    mocks.searchCorpus.mockResolvedValue(EMPTY);
  });

  afterEach(cleanup);

  it('shows the empty state before anything is typed', () => {
    render(<SearchScreen />);

    expect(screen.getByText('Type a verse reference, a word, or a root')).toBeTruthy();
    expect(mocks.searchCorpus).not.toHaveBeenCalled();
  });

  it('searches in the reader content language, not the UI locale', async () => {
    render(<SearchScreen />);

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'нет' } });

    await waitFor(() => expect(mocks.searchCorpus).toHaveBeenCalled());
    // Passing the UI locale here searches Russian text for a user reading in
    // English and returns nothing, which reads as a broken index.
    expect(mocks.searchCorpus.mock.calls.at(-1)![2]).toBe('ru');
  });

  it('renders a verse-reference jump above the hits', async () => {
    mocks.searchCorpus.mockResolvedValue({
      jump: {
        surah_id: 2,
        ayah_number: 255,
        text_uthmani: 'ٱللَّهُ',
        words: [],
        highlightPosition: null,
      },
      verses: [{ surah_id: 2, ayah_number: 255, source: 'ar', snippet: 'ٱللَّهُ' }],
      roots: [],
    });

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '2:255' } });

    await waitFor(() => expect(screen.getByTestId('search-jump')).toBeTruthy());
    expect(screen.getByTestId('search-jump').textContent).toContain('2:255');
  });

  it('opens the surah at the ayah when the jump is tapped', async () => {
    mocks.searchCorpus.mockResolvedValue({
      jump: {
        surah_id: 2,
        ayah_number: 255,
        text_uthmani: 'ٱللَّهُ',
        words: [],
        highlightPosition: null,
      },
      verses: [],
      roots: [],
    });

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '2:255' } });
    await waitFor(() => expect(screen.getByTestId('search-jump')).toBeTruthy());

    fireEvent.click(screen.getByTestId('search-jump'));

    expect(mocks.push).toHaveBeenCalledWith('/surah/2?ayah=255');
  });

  it('reports a failed search instead of an empty result', async () => {
    mocks.searchCorpus.mockRejectedValue(new Error('no such module: fts5'));

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'x' } });

    // R4: an FTS5 build problem must not look identical to an unmatched word,
    // or the first device run reports a data fault instead of a build one.
    await waitFor(() => expect(screen.getByText('Unable to search')).toBeTruthy());
  });
});
