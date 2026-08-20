import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RootRoute from '../../app/root/[buckwalter]';

const mocks = vi.hoisted(() => ({
  // Decoded, because expo-router decodes every param before a route sees it.
  // `{` is not path-safe, so the link site encodes it and the router undoes
  // that -- an encoded fixture here would pin a value production never emits.
  buckwalter: '{qwl',
  contentLanguage: 'ru',
  getRootScreen: vi.fn(),
  getRootOccurrenceCount: vi.fn(),
  getRootOccurrences: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ buckwalter: mocks.buckwalter }),
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => ({}),
}));

vi.mock('@/data/corpusRepository', () => ({
  getRootScreen: (...args: unknown[]) => mocks.getRootScreen(...args),
  getRootOccurrenceCount: (...args: unknown[]) => mocks.getRootOccurrenceCount(...args),
  getRootOccurrences: (...args: unknown[]) => mocks.getRootOccurrences(...args),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    arabicScale: 'medium',
    contentLanguage: mocks.contentLanguage,
    uiLocale: 'en',
  }),
}));

// Stubbed down to the props the route hands it: this suite is about what the
// route forwards, and ConcordanceList's own paging has its own suite.
vi.mock('@/components/ConcordanceList', async () => {
  const React = await import('react');
  return {
    ConcordanceList: ({ total, loadPage, header }: {
      total: number;
      loadPage: (offset: number, limit: number) => Promise<unknown[]>;
      header: React.ReactElement;
    }) => {
      React.useEffect(() => {
        void loadPage(0, 20);
      }, [loadPage]);
      return React.createElement(
        'div',
        null,
        header,
        React.createElement('span', { 'data-testid': 'concordance-total' }, String(total)),
      );
    },
  };
});

vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Text: host('span'),
    View: host('div'),
  };
});

const rootEntry = {
  root: { id: 7, root_buckwalter: '{qwl', root_arabic: 'قول', occurrence_count: 1722 },
  forms: [],
  definitions: [],
};

describe('RootRoute', () => {
  beforeEach(() => {
    mocks.buckwalter = '{qwl';
    mocks.contentLanguage = 'ru';
    mocks.getRootScreen.mockReset();
    mocks.getRootOccurrenceCount.mockReset();
    mocks.getRootOccurrences.mockReset();
    mocks.getRootScreen.mockResolvedValue(rootEntry);
    mocks.getRootOccurrenceCount.mockResolvedValue(1722);
    mocks.getRootOccurrences.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('pages the validated root in the chosen content language', async () => {
    // The two silent failures here are forwarding the raw param instead of the
    // parsed one, and hardcoding 'en' instead of the reader's language. Both
    // still render a plausible list.
    render(<RootRoute />);

    await waitFor(() =>
      expect(mocks.getRootOccurrences).toHaveBeenCalledWith(
        expect.anything(),
        '{qwl',
        'ru',
        0,
        20,
      ),
    );
  });

  it('hands the list the occurrence count, not the page it has loaded', async () => {
    render(<RootRoute />);

    // The list stops paging at `total`; a wrong one truncates the concordance
    // at whatever number reached it.
    await waitFor(() => expect(screen.getByTestId('concordance-total').textContent).toBe('1722'));
    expect(mocks.getRootOccurrenceCount).toHaveBeenCalledWith(expect.anything(), '{qwl');
  });

  it('never queries an identifier that is not a root', async () => {
    mocks.buckwalter = 'not a root';

    render(<RootRoute />);

    await screen.findByText('That root is not in the corpus');
    expect(mocks.getRootScreen).not.toHaveBeenCalled();
    expect(mocks.getRootOccurrences).not.toHaveBeenCalled();
  });
});
