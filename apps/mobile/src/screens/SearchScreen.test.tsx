import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// The debounce inside SearchScreen is 200ms; anything asserting "did not
// query" has to actually wait past it, or it is checking t=0, which is
// vacuously true whether or not the guard it is meant to cover exists.
const PAST_DEBOUNCE_MS = 300;
const settle = () => new Promise((resolve) => setTimeout(resolve, PAST_DEBOUNCE_MS));

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
  });

  it('never queries an empty box, even past the debounce window', async () => {
    render(<SearchScreen />);

    await settle();

    expect(mocks.searchCorpus).not.toHaveBeenCalled();
  });

  it('clears results and returns to the empty state when the box is cleared', async () => {
    mocks.searchCorpus.mockResolvedValue({
      jump: null,
      verses: [{ surah_id: 2, ayah_number: 255, source: 'ar', snippet: 'ٱللَّهُ' }],
      roots: [],
    });

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getByTestId('search-verse')).toBeTruthy());

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '' } });

    // The old hit list and the "type something" hint on screen together is
    // the bug: a stale in-flight request repainting after the box emptied.
    await waitFor(() => expect(screen.getByText('Type a verse reference, a word, or a root')).toBeTruthy());
    expect(screen.queryByTestId('search-verse')).toBeNull();

    // Past the debounce window too: nothing queued for the cleared box should
    // still be in flight and land later.
    mocks.searchCorpus.mockClear();
    await settle();
    expect(mocks.searchCorpus).not.toHaveBeenCalled();
  });

  it('drops an in-flight request when the box is cleared before it lands', async () => {
    // The sibling test above races nothing: its request has already resolved
    // by the time it clears the box. Holding the promise open is what puts a
    // request genuinely in flight across the clear.
    let land!: (value: unknown) => void;
    mocks.searchCorpus.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = resolve;
        }),
    );

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'x' } });

    await waitFor(() => expect(mocks.searchCorpus).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('search-loading')).toBeTruthy());

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '' } });
    await act(async () => {
      land({
        jump: null,
        verses: [{ surah_id: 2, ayah_number: 255, source: 'ar', snippet: '\u0671\u0644\u0644\u064e\u0651\u0647\u064f' }],
        roots: [],
      });
      await settle();
    });

    expect(screen.getByText('Type a verse reference, a word, or a root')).toBeTruthy();
    // Stale hits must not repaint under the empty state: that is the sequence
    // bump on the empty branch.
    expect(screen.queryByTestId('search-verse')).toBeNull();
    // ...and the bump orphans the request's own `finally`, so the empty branch
    // owes the spinner its own clear.
    expect(screen.queryByTestId('search-loading')).toBeNull();
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

    await waitFor(() => expect(screen.getByTestId('search-verse')).toBeTruthy());
    expect(screen.getByTestId('search-jump').textContent).toContain('2:255');

    // Order, not just presence -- reordering the two sections must fail this.
    const testIds = Array.from(document.querySelectorAll('[data-testid]')).map((el) =>
      el.getAttribute('data-testid'),
    );
    const jumpIndex = testIds.indexOf('search-jump');
    const verseIndex = testIds.indexOf('search-verse');
    expect(jumpIndex).toBeGreaterThanOrEqual(0);
    expect(verseIndex).toBeGreaterThan(jumpIndex);
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

  it('shows a surah-only jump without a fabricated ayah number', async () => {
    mocks.searchCorpus.mockResolvedValue({
      jump: {
        surah_id: 2,
        ayah_number: null,
        text_uthmani: '',
        words: [],
        highlightPosition: null,
      },
      verses: [],
      roots: [],
    });

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'Al-Baqarah' } });

    await waitFor(() => expect(screen.getByTestId('search-jump')).toBeTruthy());
    // Not '2:1' -- a surah-name match carries no ayah, and openJump pushes
    // the surah alone, so a fabricated ':1' would label a destination the
    // tap does not reach.
    expect(screen.getByTestId('search-jump').textContent).toBe('2');

    fireEvent.click(screen.getByTestId('search-jump'));
    expect(mocks.push).toHaveBeenCalledWith('/surah/2');
  });

  it('shows the no-results message when nothing matches', async () => {
    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'zzz-no-match' } });

    await waitFor(() => expect(screen.getByText('Nothing found')).toBeTruthy());
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
