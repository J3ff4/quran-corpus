import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrequencyList } from './FrequencyList';

const mocks = vi.hoisted(() => ({ getFrequencyRows: vi.fn(), push: vi.fn() }));

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
// FREQUENCY_LIMIT mirrors the real export: the list imports it, so a mock that
// omits it fails the module load. That the constant itself is above the shared
// 200 default is asserted against the real module in corpusRepository.test.ts.
vi.mock('@/data/corpusRepository', () => ({
  getFrequencyRows: mocks.getFrequencyRows,
  FREQUENCY_LIMIT: 1000,
}));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
vi.mock('expo-router', () => ({ router: { push: mocks.push } }));
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host, AccessibilityInfo } = await import('@/testing/rnHosts.js');
  return {
    // DictionaryRow squeezes on press, so it reaches useReducedMotion, which
    // reads this on mount.
    AccessibilityInfo,
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Pressable: host('button'),
    Text: host('span'),
    View: host('div'),
    FlatList: ({ data, renderItem }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    }) =>
      React.createElement(
        'div',
        null,
        data.map((item, index) => React.createElement('div', { key: index }, renderItem({ item, index }))),
      ),
  };
});

describe('FrequencyList', () => {
  beforeEach(() => {
    mocks.getFrequencyRows.mockReset();
    mocks.push.mockReset();
    mocks.getFrequencyRows.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('asks for the kind it was given', async () => {
    render(<FrequencyList kind="verbs" />);

    await waitFor(() => expect(mocks.getFrequencyRows).toHaveBeenCalled());
    expect(mocks.getFrequencyRows.mock.calls.at(-1)![1]).toBe('verbs');
  });

  it('refetches when the kind changes', async () => {
    const { rerender } = render(<FrequencyList kind="roots" />);
    await waitFor(() => expect(mocks.getFrequencyRows).toHaveBeenCalledTimes(1));

    rerender(<FrequencyList kind="lemmas" />);

    // Without this the chips change the label and nothing else: the pane keeps
    // showing roots under a heading that says lemmas.
    await waitFor(() => expect(mocks.getFrequencyRows).toHaveBeenCalledTimes(2));
    expect(mocks.getFrequencyRows.mock.calls.at(-1)![1]).toBe('lemmas');
  });

  it('renders each row with its count and routes it', async () => {
    mocks.getFrequencyRows.mockResolvedValue([
      { href: '/root/qwl', arabic: 'قول', gloss: null, count: 1722 },
    ]);

    render(<FrequencyList kind="roots" />);

    await waitFor(() => expect(screen.getByText('قول')).toBeTruthy());
    expect(screen.getByText('1722')).toBeTruthy();

    fireEvent.click(screen.getByTestId('dictionary-row'));
    expect(mocks.push).toHaveBeenCalledWith('/root/qwl');
  });

  it('renders the verb gloss in the Arabic face', async () => {
    // The gloss column is the verb's lemma, which is Arabic script. Left to
    // RN's default it renders in the Android system fallback at 14px beside
    // the same verb's surface form in Hafs at 16px.
    mocks.getFrequencyRows.mockResolvedValue([
      { href: '/lemma/qAla', arabic: 'يَقُولُ', gloss: 'قَالَ', count: 1722 },
    ]);

    render(<FrequencyList kind="verbs" />);

    await waitFor(() => expect(screen.getByText('قَالَ')).toBeTruthy());
    expect(screen.getByText('قَالَ').style.fontFamily).toBe('Hafs');
  });

  it('names the row so the count is announced as a count', async () => {
    mocks.getFrequencyRows.mockResolvedValue([
      { href: '/root/qwl', arabic: 'قول', gloss: null, count: 1722 },
    ]);

    render(<FrequencyList kind="roots" />);

    // Unlabelled, the row announces "قول 1722, link" -- nothing says what the
    // number counts.
    await waitFor(() => expect(screen.getByTestId('dictionary-row')).toBeTruthy());
    const label = screen.getByTestId('dictionary-row').getAttribute('aria-label') ?? '';
    expect(label).toContain('1722 occurrences');
  });

  it('numbers the rows from one', async () => {
    mocks.getFrequencyRows.mockResolvedValue([
      { href: '/root/qwl', arabic: 'قول', gloss: null, count: 1722 },
      { href: '/root/kwn', arabic: 'كون', gloss: null, count: 1390 },
      { href: '/root/rbb', arabic: 'رب', gloss: null, count: 980 },
    ]);

    render(<FrequencyList kind="roots" />);

    // A frequency list whose rows carry no position makes the reader count
    // down the screen to answer "how far into the top is this".
    const ranks = await screen.findAllByTestId('dictionary-rank');
    expect(ranks[0]!.textContent).toBe('1');
    expect(ranks[2]!.textContent).toBe('3');
  });

  it('heads the columns so the trailing number is not a bare integer', async () => {
    render(<FrequencyList kind="roots" />);

    expect((await screen.findByTestId('frequency-header')).textContent).toContain('Count');
  });

  it('asks for more than the top 200', async () => {
    // The shared queries default to 200; the table is the surface where a
    // reader actually scrolls past it.
    render(<FrequencyList kind="lemmas" />);

    await waitFor(() =>
      expect(mocks.getFrequencyRows).toHaveBeenCalledWith(expect.anything(), 'lemmas', 1000),
    );
  });

  it('reuses the browse row rather than a second row layout', async () => {
    mocks.getFrequencyRows.mockResolvedValue([
      { href: '/lemma/qAl', arabic: 'يَقُولُ', gloss: 'قَالَ', count: 1722 },
      { href: '/lemma/kAn', arabic: 'كَانَ', gloss: 'كَانَ', count: 1390 },
      { href: '/lemma/qAla', arabic: 'قَالُوا', gloss: 'قَالَ', count: 980 },
    ]);

    render(<FrequencyList kind="verbs" />);

    expect(await screen.findAllByTestId('dictionary-row')).toHaveLength(3);
  });

  it('says so when the query fails, rather than showing an empty list', async () => {
    mocks.getFrequencyRows.mockRejectedValue(new Error('no such table'));

    render(<FrequencyList kind="roots" />);

    // A blank pane reads as "there is nothing here", which is wrong and not
    // retryable-looking. Same finding m-5 raised against the letter screen
    // Task 9 replaced.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe('Unable to load the list');
  });
});
