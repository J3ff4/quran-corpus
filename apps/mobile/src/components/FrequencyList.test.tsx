import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrequencyList } from './FrequencyList';

const mocks = vi.hoisted(() => ({ getFrequencyRows: vi.fn(), push: vi.fn() }));

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('@/data/corpusRepository', () => ({ getFrequencyRows: mocks.getFrequencyRows }));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
vi.mock('expo-router', () => ({ router: { push: mocks.push } }));
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
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

    fireEvent.click(screen.getByTestId('frequency-row'));
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
    await waitFor(() => expect(screen.getByTestId('frequency-row')).toBeTruthy());
    const label = screen.getByTestId('frequency-row').getAttribute('aria-label') ?? '';
    expect(label).toContain('1722 occurrences');
  });

  it('says so when the query fails, rather than showing an empty list', async () => {
    mocks.getFrequencyRows.mockRejectedValue(new Error('no such table'));

    render(<FrequencyList kind="roots" />);

    // A blank pane reads as "there is nothing here", which is wrong and not
    // retryable-looking. Same finding Task 5 fixed on LetterScreen (m-5).
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe('Unable to load the list');
  });
});
