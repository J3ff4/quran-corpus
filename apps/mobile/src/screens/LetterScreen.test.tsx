import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LetterScreen } from './LetterScreen';

const mocks = vi.hoisted(() => ({
  getRootsForLetter: vi.fn(),
  /** Every string this screen has painted, in render order -- see the
   *  first-paint test for why the final DOM is not enough. */
  painted: [] as string[],
}));

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
    // Named, not a bare div: the spinner is what a test asserts on to prove
    // the screen does not paint an empty state before the query resolves.
    ActivityIndicator: () => {
      mocks.painted.push('loading');
      return React.createElement('span', null, 'loading');
    },
    Text: ({ children, ...rest }: { children?: React.ReactNode }) => {
      if (typeof children === 'string') mocks.painted.push(children);
      return React.createElement(host('span'), { ...rest, children });
    },
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
  beforeEach(() => {
    mocks.getRootsForLetter.mockReset();
    // A valid default for every test: an unstubbed call resolves undefined,
    // which crashes the render on roots.length and would turn any mutation
    // check here into a TypeError rather than a failed assertion.
    mocks.getRootsForLetter.mockResolvedValue([]);
    mocks.painted.length = 0;
  });
  afterEach(cleanup);

  it('renders the empty state for a letter outside the alphabet', async () => {
    render(<LetterScreen letter={null} />);
    // Past the microtask queue, not the same tick as render: the forbidden
    // call happens after `await openCorpusDb()`, so asserting synchronously
    // passes whether or not the guard exists.
    await act(async () => {});

    expect(screen.getByText('No roots under this letter')).toBeTruthy();
    // Validated before the DB is opened: an identifier that is not a bucket has
    // no business reaching SQLite at all.
    expect(mocks.getRootsForLetter).not.toHaveBeenCalled();
  });

  it('paints the spinner on mount, never an empty list', async () => {
    mocks.getRootsForLetter.mockResolvedValue([
      { id: 2, root_buckwalter: 'Abl', root_arabic: 'ابل', occurrence_count: 2, gloss_blob: null },
    ]);

    render(<LetterScreen letter="ا" />);
    await waitFor(() => expect(screen.getAllByTestId('letter-root')).toHaveLength(1));

    // Asserted over every frame, not the settled DOM: the effect sets loading
    // itself, so by the time the DOM is queryable the initial state has been
    // overwritten either way. On a device useEffect runs after the first
    // paint, so an un-loaded initial state tells the reader this letter has no
    // roots -- for one frame, about a letter that has one.
    expect(mocks.painted).not.toContain('No roots under this letter');
    expect(mocks.painted).toContain('loading');
  });

  it('names the letter it is showing', async () => {
    render(<LetterScreen letter="ب" />);

    // The root Stack renders a blank nav title, so this heading is the only
    // thing on screen that says which letter the list belongs to. `header` is
    // RN's spelling of the heading role; the host mock passes it through raw.
    const heading = await waitFor(() => screen.getByText('ب'));
    expect(heading.getAttribute('role')).toBe('header');
  });

  it('reports a failed load as an error, not as an empty letter', async () => {
    mocks.getRootsForLetter.mockRejectedValue(new Error('no such table: roots'));

    render(<LetterScreen letter="ا" />);

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert.textContent).toBe('Unable to load roots');
    // A retryable failure must not read as "this letter has no roots".
    expect(screen.queryByText('No roots under this letter')).toBeNull();
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
