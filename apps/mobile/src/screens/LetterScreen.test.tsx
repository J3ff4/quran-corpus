import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LetterScreen } from './LetterScreen';

const mocks = vi.hoisted(() => ({ getRootsForLetter: vi.fn() }));

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('@/data/corpusRepository', () => ({ getRootsForLetter: mocks.getRootsForLetter }));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ href, testID, children }: {
      href: string;
      testID?: string;
      children: React.ReactNode;
    }) => React.createElement('a', { href, 'data-testid': testID }, children),
  };
});
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
    ActivityIndicator: host('div'),
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

describe('LetterScreen', () => {
  beforeEach(() => mocks.getRootsForLetter.mockReset());
  afterEach(cleanup);

  it('renders the empty state for a letter outside the alphabet', () => {
    render(<LetterScreen letter={null} />);

    expect(screen.getByText('No roots under this letter')).toBeTruthy();
    // Validated before the DB is opened: an identifier that is not a bucket has
    // no business reaching SQLite at all.
    expect(mocks.getRootsForLetter).not.toHaveBeenCalled();
  });

  it('lists the letter roots in the order the repository returns them', async () => {
    mocks.getRootsForLetter.mockResolvedValue([
      { id: 2, root_buckwalter: 'Abl', root_arabic: 'ابل', occurrence_count: 2, gloss_blob: 'camel' },
      { id: 1, root_buckwalter: '>wb', root_arabic: 'أوب', occurrence_count: 18, gloss_blob: 'to return' },
    ]);

    render(<LetterScreen letter="ا" />);

    // Both the rows and their order: the repository already sorted these, and a
    // screen that re-sorts or reverses them would still render two roots.
    await waitFor(() => expect(screen.getAllByTestId('letter-root')).toHaveLength(2));
    expect(screen.getAllByTestId('letter-root').map((node) => node.textContent)).toEqual(['ابل', 'أوب']);
  });

  it('links each root to its own encoded route', async () => {
    mocks.getRootsForLetter.mockResolvedValue([
      { id: 3, root_buckwalter: '>wb', root_arabic: 'أوب', occurrence_count: 18, gloss_blob: null },
    ]);

    render(<LetterScreen letter="ا" />);

    // `>` is a Buckwalter letter and an unsafe path character; the href must
    // carry it percent-encoded or the root route 404s.
    await waitFor(() =>
      expect(screen.getAllByTestId('letter-root')[0]!.getAttribute('href')).toBe('/root/%3Ewb'),
    );
  });
});
