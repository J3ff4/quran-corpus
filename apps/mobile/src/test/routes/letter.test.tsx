import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Not colocated with the route -- see word.test.tsx for why app/ cannot hold a
// test file.
import LetterRoute from '../../../app/dictionary/letter/[letter]';

const mocks = vi.hoisted(() => ({
  params: { letter: 'ا' } as Record<string, string>,
  getRootsForLetter: vi.fn(),
}));

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    useLocalSearchParams: () => mocks.params,
    Link: ({ href, testID, children }: { href: string; testID?: string; children: React.ReactNode }) =>
      React.createElement('a', { href, 'data-testid': testID }, children),
  };
});

vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: (db: unknown) => db }));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: async () => ({}) }));
vi.mock('@/data/corpusRepository', () => ({ getRootsForLetter: mocks.getRootsForLetter }));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));

vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
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

describe('letter route', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.params = { letter: 'ا' };
    mocks.getRootsForLetter.mockReset();
    // A valid default, so a param that wrongly gets through fails on the
    // assertion below rather than crashing the render on an undefined list.
    mocks.getRootsForLetter.mockResolvedValue([]);
  });

  it.each([
    ['x', 'a Latin letter'],
    ['ة', 'a letter the alphabet folds away rather than carries'],
    ['اب', 'two letters'],
    ['%D8%A7', 'a still-encoded segment'],
    ['../etc', 'a traversal segment'],
    ['', 'empty'],
  ])('rejects letter %s (%s) before querying', async (bad) => {
    // Route params are untrusted. ARABIC_ALPHABET_ORDER is a fixed set;
    // anything outside it is not a bucket and must not reach the query.
    mocks.params = { letter: bad };

    render(<LetterRoute />);
    // Past the microtask queue: the query would only run after
    // `await openCorpusDb()`, so a same-tick assertion proves nothing.
    await act(async () => {});

    expect(screen.getByText('No roots under this letter')).toBeTruthy();
    expect(mocks.getRootsForLetter).not.toHaveBeenCalled();
  });

  it('queries the letter the alphabet does carry', async () => {
    mocks.params = { letter: 'ب' };

    render(<LetterRoute />);
    await act(async () => {});

    expect(mocks.getRootsForLetter).toHaveBeenCalledWith({}, 'ب');
  });
});
