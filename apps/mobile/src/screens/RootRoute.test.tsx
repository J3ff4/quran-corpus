import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  replace: vi.fn(),
  recordRootView: vi.fn(),
  /** The `total` in force each time ConcordanceList is handed a new loadPage,
   *  i.e. each time it would restart the list. */
  listResets: [] as number[],
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ buckwalter: mocks.buckwalter }),
  router: { push: mocks.push, replace: mocks.replace },
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => ({}),
}));

vi.mock('@/data/userDb', () => ({
  openUserDb: async () => ({}),
}));

vi.mock('@/data/userRepository', () => ({
  recordRootView: (...args: unknown[]) => mocks.recordRootView(...args),
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
    ConcordanceList: ({ total, loadPage, header, countFailed }: {
      total: number;
      loadPage: (offset: number, limit: number) => Promise<unknown[]>;
      header: React.ReactElement;
      countFailed?: boolean;
    }) => {
      // The real component resets on a change to EITHER loadPage or total, so
      // recording the total that arrives with each new loadPage is what shows
      // whether the two are handed over together.
      const totalRef = React.useRef(total);
      totalRef.current = total;
      React.useEffect(() => {
        mocks.listResets.push(totalRef.current);
        void loadPage(0, 20);
      }, [loadPage]);
      return React.createElement(
        'div',
        { 'data-count-failed': countFailed ? 'true' : 'false' },
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
  forms: [
    { id: 1, root_id: 7, sort_order: 0, pos_label: 'Form I verb', form_arabic: 'قَالَ',
      form_translit: 'qāla', gloss: 'to say', occurrence_count: 1618 },
  ],
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
    mocks.replace.mockReset();
    mocks.recordRootView.mockReset();
    mocks.listResets.length = 0;
    mocks.getRootScreen.mockResolvedValue(rootEntry);
    mocks.getRootOccurrenceCount.mockResolvedValue(1722);
    mocks.getRootOccurrences.mockResolvedValue([]);
    mocks.getAdjacentRoots.mockResolvedValue({ prev: null, next: null });
  });

  afterEach(cleanup);

  it('counts the root as viewed once it has resolved', async () => {
    render(<RootRoute />);

    await waitFor(() => expect(mocks.recordRootView).toHaveBeenCalled());
    // The integer id, not the Buckwalter string: root_views is keyed by id
    // precisely so no charset validator is needed at this write site.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    expect(mocks.recordRootView).toHaveBeenCalledWith({}, 7, today);
  });

  it('does not count a root the corpus does not carry', async () => {
    // Written after the entry resolves, not alongside the query, so a deep
    // link to a root that does not exist cannot inflate the roots counter with
    // something the reader never saw.
    mocks.getRootScreen.mockResolvedValue(null);
    render(<RootRoute />);

    await waitFor(() => expect(mocks.getRootScreen).toHaveBeenCalled());
    await Promise.resolve();
    expect(mocks.recordRootView).not.toHaveBeenCalled();
  });

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
        // Trailing formIds: no chip is selected in this test, so the route
        // passes it through explicitly as undefined rather than omitting it.
        undefined,
      ),
    );
  });

  it('hands the list the occurrence count, not the page it has loaded', async () => {
    render(<RootRoute />);

    // The list stops paging at `total`; a wrong one truncates the concordance
    // at whatever number reached it.
    await waitFor(() => expect(screen.getByTestId('concordance-total').textContent).toBe('1722'));
    expect(mocks.getRootOccurrenceCount).toHaveBeenCalledWith(expect.anything(), '{qwl', undefined);
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

  it('lays the root letters out right to left', async () => {
    render(<RootRoute />);
    const row = await screen.findByTestId('root-letters');
    expect(row.style.flexDirection).toBe('row-reverse');
    // Tree order stays logical, because TalkBack reads the tree, not the
    // layout -- reversing the array instead would announce the root backwards.
    expect(screen.getAllByTestId('root-letter').map((pill) => pill.textContent)).toEqual([
      'ق',
      'و',
      'ل',
    ]);
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
    // replace, not push: five taps of Next used to leave six screens on the
    // stack, and root screens are outside the tab group -- back was the only
    // way out, six times over.
    expect(mocks.replace).toHaveBeenCalledWith('/root/qwm');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('disables the arrow at the end of the list rather than hiding it', async () => {
    // A vanishing control moves the other one under the thumb mid-scroll;
    // TalkBack gets the disabled state instead.
    mocks.getAdjacentRoots.mockResolvedValue({ prev: 'qtl', next: null });
    render(<RootRoute />);
    const next = await screen.findByTestId('root-next');
    await waitFor(() => expect(next.getAttribute('aria-disabled')).toBe('true'));
    fireEvent.click(next);
    expect(mocks.replace).not.toHaveBeenCalled();
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

  it('narrows the concordance to the selected forms', async () => {
    render(<RootRoute />);
    fireEvent.click((await screen.findAllByTestId('form-chip'))[0]!);
    await waitFor(() =>
      expect(mocks.getRootOccurrences).toHaveBeenLastCalledWith(
        expect.anything(), '{qwl', 'ru', 0, expect.any(Number), [1],
      ),
    );
  });

  it('recounts the total for the filtered set', async () => {
    // Filtering the rows but not the count renders "Concordance (1722)" over 92
    // occurrences -- the heading would be a lie about what is on screen.
    mocks.getRootOccurrenceCount.mockResolvedValueOnce(1722).mockResolvedValueOnce(92);
    render(<RootRoute />);
    fireEvent.click((await screen.findAllByTestId('form-chip'))[0]!);
    await waitFor(() =>
      expect(screen.getByTestId('concordance-heading').textContent).toBe('Concordance (92)'),
    );
  });

  it('goes back to every occurrence when the last chip is cleared', async () => {
    render(<RootRoute />);
    const chip = (await screen.findAllByTestId('form-chip'))[0]!;
    fireEvent.click(chip);
    fireEvent.click(chip);
    await waitFor(() =>
      expect(mocks.getRootOccurrences).toHaveBeenLastCalledWith(
        expect.anything(), '{qwl', 'ru', 0, expect.any(Number), undefined,
      ),
    );
  });

  it('drops the total to zero when the recount fails, and says the read broke', async () => {
    // Not a cosmetic fallback: keeping the pre-filter total would caption the
    // list with a number the failed query never returned. The count runs in a
    // bare effect nothing awaits, so without its own catch a DB failure is an
    // unhandled promise rejection rather than a degraded heading.
    //
    // The zero alone is not enough. `total` is also the list's stop condition,
    // so a zero it cannot explain renders the empty state -- "no occurrences"
    // for a root with 1722 of them, which is exactly the m-5 failure this
    // phase already fixed on the paging path.
    mocks.getRootOccurrenceCount
      .mockResolvedValueOnce(1722)
      .mockRejectedValueOnce(new Error('no such table: word_segments'));
    render(<RootRoute />);
    await waitFor(() => expect(screen.getByTestId('concordance-total').textContent).toBe('1722'));
    fireEvent.click((await screen.findAllByTestId('form-chip'))[0]!);
    await waitFor(() => expect(screen.getByTestId('concordance-total').textContent).toBe('0'));
    expect(
      screen.getByTestId('concordance-total').parentElement!.getAttribute('data-count-failed'),
    ).toBe('true');
  });

  it('waits for the new root count rather than captioning it with the old one', async () => {
    // getRootScreen is three round trips and the count is one, so the count
    // usually wins -- but not always. Whichever order they land in, a header
    // rendered on the entry alone captions the new root with the previous
    // root's total, and loadPage pages the wrong root under it.
    let releaseCount: (count: number) => void = () => {};
    mocks.getRootOccurrenceCount
      .mockResolvedValueOnce(1722)
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            releaseCount = resolve;
          }),
      );
    const { rerender } = render(<RootRoute />);
    await waitFor(() => expect(screen.getByTestId('concordance-total').textContent).toBe('1722'));

    mocks.buckwalter = 'qwm';
    rerender(<RootRoute />);

    await waitFor(() => expect(mocks.getRootScreen).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('concordance-total')).toBeNull();

    await act(async () => {
      releaseCount(3);
    });
    await waitFor(() => expect(screen.getByTestId('concordance-total').textContent).toBe('3'));
  });

  it('restarts the list once per filter change, against the count taken for it', async () => {
    // ConcordanceList reads both `total` and `loadPage` as list identity. Hand
    // it the new filter before its count lands and it resets against the old
    // total, fetches page 0, then resets and fetches page 0 again when the
    // count arrives -- two queries and a visible flash of rows appearing and
    // vanishing. [1722, 1722] here is that bug; [1722, 92] is the fix.
    mocks.getRootOccurrenceCount.mockResolvedValueOnce(1722).mockResolvedValueOnce(92);
    render(<RootRoute />);
    await waitFor(() => expect(mocks.listResets).toEqual([1722]));

    fireEvent.click((await screen.findAllByTestId('form-chip'))[0]!);

    await waitFor(() => expect(mocks.listResets).toEqual([1722, 92]));
  });

  it('clears the form filter when a neighbour root is opened', async () => {
    // Form ids are per-root. Carrying one across Previous/Next filters the new
    // root by an id that belongs to a form it does not have.
    const { rerender } = render(<RootRoute />);
    fireEvent.click((await screen.findAllByTestId('form-chip'))[0]!);
    mocks.buckwalter = 'qwm';
    rerender(<RootRoute />);
    await waitFor(() =>
      expect(mocks.getRootOccurrences).toHaveBeenLastCalledWith(
        expect.anything(), 'qwm', 'ru', 0, expect.any(Number), undefined,
      ),
    );
  });
});
