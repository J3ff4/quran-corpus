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
  getRootGlossList: vi.fn(),
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
  getRootGlossList: (...args: unknown[]) => mocks.getRootGlossList(...args),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    arabicScale: 'medium',
    contentLanguage: mocks.contentLanguage,
    // Deliberately NOT the same as contentLanguage: the glosses are content,
    // so they follow the composed query language (R9-2's exception -- the
    // script reaches them, unlike surah names). Reading the picked language
    // here instead would serve Latin Uzbek glosses to a Cyrillic reader, and
    // with the two mocked equal that regression would pass.
    queryLanguage: 'uz-Cyrl',
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

// InfoSheet has its own suite (InfoSheet.test.tsx). Stubbed to a bare
// button/body pair, for the same reason LemmaScreen's suite stubs it: the real
// one pulls BottomSheet's reanimated and gesture-handler dependencies into a
// screen suite that isn't about them. Neither stub holds state -- the open
// state is the screen's, which is why the two are separate components.
vi.mock('@/components/InfoSheet', async () => {
  const React = await import('react');
  return {
    InfoButton: ({ label, onPress }: { label: string; onPress: () => void }) =>
      React.createElement('button', { 'data-testid': 'info-button', onClick: onPress }, label),
    InfoSheet: ({ body }: { body: string }) =>
      React.createElement('div', { 'data-testid': 'info-body' }, body),
  };
});

// reactNativeTextMock, not the bare `host` factory: the header now renders
// EntryHeader and DefinitionCard, both of which mount ClampedText, and
// Pressable for the Previous/Next arrows -- see reactNativeTextMock's doc
// comment in rnHosts.ts.
vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return {
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
    mocks.getRootGlossList.mockReset();
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.recordRootView.mockReset();
    mocks.listResets.length = 0;
    mocks.getRootScreen.mockResolvedValue(rootEntry);
    mocks.getRootOccurrenceCount.mockResolvedValue(1722);
    mocks.getRootOccurrences.mockResolvedValue([]);
    mocks.getAdjacentRoots.mockResolvedValue({ prev: null, next: null });
    mocks.getRootGlossList.mockResolvedValue([]);
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

  it('pages the validated root in the composed query language', async () => {
    // The two silent failures here are forwarding the raw param instead of the
    // parsed one, and hardcoding 'en' instead of the reader's language. Both
    // still render a plausible list. 'uz-Cyrl', not the 'ru' contentLanguage:
    // the rows under the gloss block are the same word-by-word content it is,
    // so a Cyrillic reader must not get Latin rows below Cyrillic glosses.
    render(<RootRoute />);

    await waitFor(() =>
      expect(mocks.getRootOccurrences).toHaveBeenCalledWith(
        expect.anything(),
        '{qwl',
        'uz-Cyrl',
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

  it('pages to the hijāʾī neighbour in place, without navigating', async () => {
    mocks.getAdjacentRoots.mockResolvedValue({ prev: 'qtl', next: 'qwm' });
    render(<RootRoute />);
    fireEvent.click(await screen.findByTestId('root-next'));
    // The next root's queries run...
    await waitFor(() =>
      expect(mocks.getRootScreen).toHaveBeenLastCalledWith(expect.anything(), 'qwm'),
    );
    // ...and the navigator is not involved at all. It used to be a `replace`,
    // which remounted the screen: that destroyed the root being paged away
    // from before the incoming one rendered, leaving the pager nothing to
    // slide out, and ran the navigator's own push transition -- the one that
    // was animating the back arrow -- over the top of it.
    expect(mocks.replace).not.toHaveBeenCalled();
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

  it('counts the concordance beside its heading', async () => {
    // The count moved out of the heading string and into its own node when the
    // row became an eyebrow with a right-aligned total (m6g-4). Both halves
    // still have to be on screen: the heading alone says nothing about size,
    // and a bare number says nothing about what it counts.
    mocks.getRootOccurrenceCount.mockResolvedValue(1722);
    render(<RootRoute />);
    expect((await screen.findByTestId('concordance-heading')).textContent).toBe('Concordance');
    expect(screen.getByTestId('concordance-count').textContent).toBe('1722');
  });

  it('narrows the concordance to the selected forms', async () => {
    render(<RootRoute />);
    fireEvent.click((await screen.findAllByTestId('form-chip'))[0]!);
    await waitFor(() =>
      expect(mocks.getRootOccurrences).toHaveBeenLastCalledWith(
        expect.anything(), '{qwl', 'uz-Cyrl', 0, expect.any(Number), [1],
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
      expect(screen.getByTestId('concordance-count').textContent).toBe('92'),
    );
  });

  it('goes back to every occurrence when the last chip is cleared', async () => {
    render(<RootRoute />);
    const chip = (await screen.findAllByTestId('form-chip'))[0]!;
    fireEvent.click(chip);
    fireEvent.click(chip);
    await waitFor(() =>
      expect(mocks.getRootOccurrences).toHaveBeenLastCalledWith(
        expect.anything(), '{qwl', 'uz-Cyrl', 0, expect.any(Number), undefined,
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
    // A visibly different second root, so "the new headword under the old
    // total" is a state this test can actually see. With one fixture for both
    // roots the mixed render is indistinguishable from the correct one, and
    // the assertion below passes whether or not the gate exists.
    mocks.getRootScreen.mockResolvedValueOnce(rootEntry).mockResolvedValueOnce({
      ...rootEntry,
      root: { id: 8, root_buckwalter: 'qwm', root_arabic: 'قوم', occurrence_count: 3 },
    });
    const { rerender } = render(<RootRoute />);
    await waitFor(() => expect(screen.getByTestId('concordance-total').textContent).toBe('1722'));

    mocks.buckwalter = 'qwm';
    rerender(<RootRoute />);

    await waitFor(() => expect(mocks.getRootScreen).toHaveBeenCalledTimes(2));
    // The previous root stays whole -- its own headword, its own total, its
    // own rows -- until the new one's count lands. It is not replaced
    // piecemeal, and it is not blanked to a spinner either: holding it is what
    // leaves the pager something to slide out.
    expect(screen.getByTestId('root-buckwalter').textContent).toBe('{qwl');
    expect(screen.getByTestId('entry-count').textContent).toBe('1722 occurrences');
    expect(screen.getByTestId('concordance-total').textContent).toBe('1722');
    expect(mocks.getRootOccurrences.mock.calls.some((call) => call[1] === 'qwm')).toBe(false);

    await act(async () => {
      releaseCount(3);
    });
    await waitFor(() => expect(screen.getByTestId('concordance-total').textContent).toBe('3'));
    expect(screen.getByTestId('root-buckwalter').textContent).toBe('qwm');
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
        expect.anything(), 'qwm', 'uz-Cyrl', 0, expect.any(Number), undefined,
      ),
    );
  });
  it("reads the root's glosses by id, in the composed query language", async () => {
    render(<RootRoute />);

    // The id, not the Buckwalter string: root_glosses is keyed by id, and
    // asking by string would put the deep-link segment through a second trust
    // boundary. 'uz-Cyrl', not 'ru': a gloss is content, so the script
    // reaches it.
    await waitFor(() =>
      expect(mocks.getRootGlossList).toHaveBeenCalledWith(expect.anything(), 7, 'uz-Cyrl'),
    );
  });

  it('shows the word-by-word glosses above the lexicon article', async () => {
    mocks.getRootGlossList.mockResolvedValue([
      { gloss: 'dedi', occurrence_count: 445 },
      { gloss: 'aytgin', occurrence_count: 293 },
    ]);
    render(<RootRoute />);

    const glosses = await screen.findByTestId('root-glosses');
    expect(glosses.textContent).toBe('dedi · aytgin');
    // Order matters (check 366): these are the words translators used, the
    // article below is the scholarly account. compareDocumentPosition rather
    // than reading the DOM by index -- the header's other blocks sit between.
    const definitions = screen.getByTestId('root-no-definition');
    expect(
      glosses.compareDocumentPosition(definitions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('omits the gloss block for a language with no word-by-word set', async () => {
    // Every language but Uzbek returns none. An empty caption over an empty
    // line reads as a failed query rather than as a language that has no
    // word-by-word data at all.
    mocks.getRootGlossList.mockResolvedValue([]);
    render(<RootRoute />);

    await waitFor(() => expect(mocks.getRootGlossList).toHaveBeenCalled());
    expect(screen.queryByTestId('root-glosses')).toBeNull();
  });

  it('still renders the root when only the gloss read fails', async () => {
    // root_glosses is the newest table in the bundle, so a corpus built before
    // it throws `no such table` here. Sharing the entry's catch turned that one
    // absent table into NotFound for EVERY root in the app -- the article, the
    // concordance and the neighbours all present in the row that loaded fine.
    mocks.getRootGlossList.mockRejectedValue(new Error('no such table: root_glosses'));
    render(<RootRoute />);

    expect(await screen.findByTestId('root-no-definition')).toBeTruthy();
    expect(screen.queryByTestId('root-glosses')).toBeNull();
  });

  it('does not ask for glosses for a root the corpus does not carry', async () => {
    // There is no id to ask with, and the screen renders NotFound either way.
    mocks.getRootScreen.mockResolvedValue(null);
    render(<RootRoute />);

    await waitFor(() => expect(mocks.getRootScreen).toHaveBeenCalled());
    await Promise.resolve();
    expect(mocks.getRootGlossList).not.toHaveBeenCalled();
  });
});
