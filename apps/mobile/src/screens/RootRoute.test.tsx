import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  getAdjacentRoots: vi.fn(),
  push: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ buckwalter: mocks.buckwalter }),
  router: { push: mocks.push },
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
  getAdjacentRoots: (...args: unknown[]) => mocks.getAdjacentRoots(...args),
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

// reactNativeTextMock, not the bare `host` factory: the header now renders
// EntryHeader and DefinitionCard, both of which mount ClampedText, and
// Pressable for the Previous/Next arrows -- see reactNativeTextMock's doc
// comment in rnHosts.ts.
vi.mock('react-native', async () => {
  const React = await import('react');
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    ...reactNativeTextMock(),
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
    mocks.getAdjacentRoots.mockReset();
    mocks.push.mockReset();
    mocks.getRootScreen.mockResolvedValue(rootEntry);
    mocks.getRootOccurrenceCount.mockResolvedValue(1722);
    mocks.getRootOccurrences.mockResolvedValue([]);
    mocks.getAdjacentRoots.mockResolvedValue({ prev: null, next: null });
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

  it('spells the root out as one pill per letter', async () => {
    mocks.getRootScreen.mockResolvedValue({
      root: { id: 1, root_buckwalter: 'qwl', root_arabic: 'ق و ل', occurrence_count: 1722 },
      forms: [],
      definitions: [],
    });
    render(<RootRoute />);
    // Three letters, and the inter-letter spaces are not pills of their own.
    expect(await screen.findAllByTestId('root-letter')).toHaveLength(3);
  });

  it('says how often the root occurs', async () => {
    render(<RootRoute />);
    // .textContent, not the jest-dom toHaveTextContent matcher: jest-dom is
    // an apps/web dependency only.
    expect((await screen.findByTestId('entry-count')).textContent).toBe('1722 occurrences');
  });

  it('links Previous and Next to the hijāʾī neighbours', async () => {
    mocks.getAdjacentRoots.mockResolvedValue({ prev: 'qtl', next: 'qwm' });
    render(<RootRoute />);
    fireEvent.click(await screen.findByTestId('root-next'));
    expect(mocks.push).toHaveBeenCalledWith('/root/qwm');
  });

  it('disables the arrow at the end of the list rather than hiding it', async () => {
    // A vanishing control moves the other one under the thumb mid-scroll;
    // TalkBack gets the disabled state instead.
    mocks.getAdjacentRoots.mockResolvedValue({ prev: 'qtl', next: null });
    render(<RootRoute />);
    const next = await screen.findByTestId('root-next');
    await waitFor(() => expect(next.getAttribute('aria-disabled')).toBe('true'));
    fireEvent.click(next);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('renders one card per definition, each credited', async () => {
    mocks.getRootScreen.mockResolvedValue({
      root: { id: 1, root_buckwalter: 'qwl', root_arabic: 'قول', occurrence_count: 5 },
      forms: [],
      definitions: [
        { id: 1, root_id: 1, source: 'hanswehr', definition: 'to say' },
        { id: 2, root_id: 1, source: 'lane', definition: 'he said' },
      ],
    });
    render(<RootRoute />);
    expect(await screen.findAllByTestId('definition-card')).toHaveLength(2);
  });

  it('says the lexicon has no entry rather than rendering an empty section', async () => {
    // 24 roots still carry no definition (hw_gap_24.tsv). Silence reads as a
    // bug.
    mocks.getRootScreen.mockResolvedValue({
      root: { id: 1, root_buckwalter: 'qwl', root_arabic: 'قول', occurrence_count: 5 },
      forms: [],
      definitions: [],
    });
    render(<RootRoute />);
    expect(await screen.findByTestId('root-no-definition')).toBeTruthy();
  });

  it('counts the concordance in its heading', async () => {
    mocks.getRootOccurrenceCount.mockResolvedValue(1722);
    render(<RootRoute />);
    expect((await screen.findByTestId('concordance-heading')).textContent).toBe(
      'Concordance (1722)',
    );
  });
});
