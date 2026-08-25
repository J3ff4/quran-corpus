import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
import type * as CorpusRepository from '@/data/corpusRepository';
import type { WbwPage, WbwScreenData, WordSummary } from '@/data/corpusRepository';
import { deferred } from '@/testing/deferred';
// Not colocated with the route -- see word.test.tsx for why app/ cannot hold a
// test file.
import WbwRoute from '../../../app/surah/[surahId]/words';

const mocks = vi.hoisted(() => ({
  params: { surahId: '2' } as Record<string, string>,
  getWbwScreen: vi.fn(),
  setWbwDensity: vi.fn(),
  /** The persisted layout the screen renders. Reassigned per test. */
  wbwDensity: 'hybrid' as 'hybrid' | 'dense',
  loadWordSummary: vi.fn(),
  push: vi.fn(),
  // The screen puts its title and pager in the nav header, so the pager is not
  // in its own subtree any more. Captured here and rendered by RouteWithHeader
  // below, which keeps every existing pager assertion querying real output
  // rather than props.
  headerRight: null as null | (() => React.ReactNode),
  headerTitle: null as unknown,
  /** Set by RouteWithHeader so a setOptions call re-renders the header. */
  onHeader: null as null | (() => void),
  // One stable object, not a fresh one per call: the screen's setOptions effect
  // depends on the navigation identity, so a new object per render would re-run it
  // on every render -- and RouteWithHeader re-renders from inside it.
  navigation: {
    setOptions(options: { headerTitle?: unknown; headerRight?: () => React.ReactNode }) {
      mocks.headerTitle = options.headerTitle;
      mocks.headerRight = options.headerRight ?? null;
      mocks.onHeader?.();
    },
  },
}));

vi.mock('expo-router', () => ({
  router: { push: mocks.push },
  useLocalSearchParams: () => mocks.params,
  useNavigation: () => mocks.navigation,
}));

/** The route plus whatever it pushed into the nav header, in one tree. */
function RouteWithHeader() {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    mocks.onHeader = bump;
    return () => {
      mocks.onHeader = null;
    };
  }, []);

  return (
    <>
      <WbwRoute />
      {mocks.headerRight ? mocks.headerRight() : null}
    </>
  );
}

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
  // corpusRepository asserts this covers every content language at module load.
  selectedTranslators: { en: 'Saheeh International', uz: 'Muhammad Sodik', ru: 'Abu Adel' },
}));

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => ({}),
}));

// Partial: VersePicker reads WBW_PAGE_SIZE and wbwPageRange from this module,
// and stubbing those out would leave the pager's arithmetic untested here and
// silently disagreeing with the repository's.
vi.mock('@/data/corpusRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof CorpusRepository>();
  return {
    ...actual,
    getWbwScreen: (...args: unknown[]) => mocks.getWbwScreen(...args),
    // Every layout prints a gloss per word, so the screen fetches the surah's
    // gloss map before it renders. Stubbed here because the real one runs SQL
    // against openCorpusDb's stub object.
    getSurahGlosses: async () => new Map<number, string>([[1, 'Allah'], [2, 'not']]),
  };
});

vi.mock('@/data/useWordSummaryLoader', () => ({
  useWordSummaryLoader: () => mocks.loadWordSummary,
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    contentLanguage: 'en',
    uiLocale: 'en',
    arabicScale: 'medium',
    wbwDensity: mocks.wbwDensity,
    setWbwDensity: mocks.setWbwDensity,
  }),
}));

// The sheet has its own suite; stubbed so this one covers the wiring without
// pulling reanimated and gesture-handler in.
vi.mock('@/components/WordSheet', async () => {
  const React = await import('react');
  return {
    WordSheet: ({
      summary,
      onOpenDetail,
    }: {
      summary: WordSummary | null;
      onOpenDetail: (word: Word) => void;
    }) =>
      summary
        ? React.createElement(
            'div',
            { 'data-testid': 'word-sheet' },
            React.createElement('span', null, summary.word.text_arabic),
            React.createElement('button', {
              'data-testid': 'open-detail',
              onClick: () => onOpenDetail(summary.word),
            }),
          )
        : null,
  };
});

vi.mock('react-native', async () => {
  const React = await import('react');
  const { AccessibilityInfo, host } = await import('@/testing/rnHosts.js');

  return {
    // usePressScale -> useReducedMotion reads this on mount, and the density
    // chip's segments are the first pressables this screen has had.
    AccessibilityInfo,
    ActivityIndicator: () => React.createElement('span', { 'data-testid': 'loading' }),
    FlatList: ({
      data,
      renderItem,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    }) =>
      React.createElement(
        'div',
        null,
        data.map((item, index) =>
          React.createElement(React.Fragment, { key: index }, renderItem({ item, index })),
        ),
      ),
    Pressable: host('button'),
    Text: host('span'),
    View: host('div'),
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
  };
});



function word(id: number, textArabic: string): Word {
  return {
    id,
    ayah_id: 200 + id,
    position: id,
    text_arabic: textArabic,
    transliteration: null,
    root: null,
    lemma: null,
    root_buckwalter: null,
    lemma_buckwalter: null,
    pos_tag: 'N',
    morphology_json: null,
    morphology_description: null,
    grammar_arabic: null,
    grammar_note: null,
    audio_url: null,
  };
}

function segment(wordId: number): WordSegment {
  return {
    id: wordId * 10,
    word_id: wordId,
    segment_index: 1,
    segment_type: 'stem',
    pos_tag: 'N',
    form_arabic: null,
    form_buckwalter: null,
    features_json: null,
    lemma: null,
    root: null,
  };
}

function page(ayahNumber: number, words: Word[]): WbwPage {
  return {
    ayahNumber,
    words,
    segments: new Map(words.map((w) => [w.id, [segment(w.id)]])),
  };
}

function screenData(overrides: Partial<WbwScreenData> = {}): WbwScreenData {
  return {
    surah: {
      id: 2,
      name_arabic: 'البقرة',
      name_translit: 'Al-Baqarah',
      name_translation: 'The Cow',
      revelation_type: 'medinan',
      ayah_count: 286,
      order_number: 87,
    },
    from: 1,
    to: 10,
    pages: [page(1, [word(1, 'الم')]), page(2, [word(2, 'ذلك'), word(3, 'الكتاب')])],
    ...overrides,
  };
}

function summaryFor(w: Word): WordSummary {
  return { word: w, segments: [], gloss: null };
}

describe('word-by-word route', () => {
  afterEach(cleanup);

  beforeEach(() => {
    // Module-level, so without this a test renders the previous test's header
    // -- a pager wired to a screen that has already unmounted.
    mocks.headerRight = null;
    mocks.headerTitle = null;
    mocks.params = { surahId: '2' };
    mocks.wbwDensity = 'hybrid';
    mocks.getWbwScreen.mockReset();
    mocks.getWbwScreen.mockResolvedValue(screenData());
    mocks.loadWordSummary.mockReset();
    mocks.loadWordSummary.mockImplementation(async (w: Word) => summaryFor(w));
    mocks.push.mockReset();
  });

  it.each([
    ['0', 'below the first surah'],
    ['115', 'past the last surah'],
    ['../etc', 'a traversal segment'],
  ])('refuses %s (%s) without opening the database', async (surahId) => {
    mocks.params = { surahId };

    render(<RouteWithHeader />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mocks.getWbwScreen).not.toHaveBeenCalled();
  });

  it('asks for the range named by ?from=', async () => {
    mocks.params = { surahId: '2', from: '255' };

    render(<RouteWithHeader />);

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenCalledWith(expect.anything(), 2, 255));
  });

  it('ignores a ?from= that is not an ayah coordinate', async () => {
    // Untrusted input: the route is deep-linkable, so `from` has to be
    // validated even though the app writes its own links.
    mocks.params = { surahId: '2', from: '1e9' };

    render(<RouteWithHeader />);

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenCalledWith(expect.anything(), 2, 1));
  });

  it('renders the hybrid layout by default and remembers a switch to dense', async () => {
    mocks.params = { surahId: '2' };

    render(<RouteWithHeader />);
    await screen.findAllByTestId('wbw-cell');

    // One container per ayah in range, so all-queries throughout.
    expect(screen.getAllByTestId('wbw-wrap').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('segment-dense'));

    // Decision 26: the chip writes the setting, it does not hold local state --
    // local state forgets the choice on every navigation, and the density is
    // meant to be a reading preference.
    expect(mocks.setWbwDensity).toHaveBeenCalledWith('dense');
  });

  it('renders the dense layout when the setting says so', async () => {
    mocks.wbwDensity = 'dense';
    mocks.params = { surahId: '2' };

    render(<RouteWithHeader />);
    await screen.findAllByTestId('wbw-cell');

    expect(screen.getAllByTestId('wbw-dense-run').length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('wbw-wrap')).toHaveLength(0);
    expect(screen.queryAllByTestId('wbw-ayah-line')).toHaveLength(0);
  });

  it('gives every word its gloss, not the first one', async () => {
    mocks.params = { surahId: '2' };

    render(<RouteWithHeader />);
    await screen.findAllByTestId('wbw-cell');

    // The screen fetches one map for the whole surah and each cell looks its
    // own word up in it. Fanning the first entry out to every cell renders a
    // full, plausible, entirely wrong screen.
    expect(screen.getAllByTestId('wbw-gloss-1')[0]!.textContent).toBe('Allah');
    expect(screen.getAllByTestId('wbw-gloss-2')[0]!.textContent).toBe('not');
  });

  it('puts the surah name and the pager in the nav header, not in rows above the grid', async () => {
    // Stacked, the tab header, a title block and a pager row took roughly a
    // third of the screen before the first word (owner screenshot, 2026-08-17).
    render(<RouteWithHeader />);
    await screen.findAllByTestId('wbw-cell');

    // headerTitle, not title: `title` also renames the bottom tab, which has
    // to keep saying Morphology.
    expect(mocks.headerTitle).toBe('Al-Baqarah');
    // findBy, not getBy: the header renders on the re-render setOptions
    // triggers, which is one commit behind the grid.
    expect(await screen.findByTestId('wbw-next')).toBeTruthy();
  });

  it('renders one cell per word across every page in range', async () => {
    render(<RouteWithHeader />);

    expect(await screen.findAllByTestId('wbw-cell')).toHaveLength(3);
  });

  it('shows the range the repository actually served, not the one requested', async () => {
    // getWbwScreen clamps a start past the end of the surah. Rendering the
    // requested range instead would label an al-Fatihah page "200-209".
    mocks.getWbwScreen.mockResolvedValue(screenData({ from: 7, to: 7 }));

    render(<RouteWithHeader />);

    expect(await screen.findByText('7–7')).toBeTruthy();
  });

  it('reloads at the next page when the pager advances', async () => {
    render(<RouteWithHeader />);
    await screen.findAllByTestId('wbw-cell');

    fireEvent.click(await screen.findByTestId('wbw-next'));

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 2, 11));
  });

  it('starts over at the range the new params name after an in-app navigation', async () => {
    // expo-router reuses this component for the next push to the same route,
    // so a paged-to position survives unless the params reset it -- opening
    // surah 3 after paging surah 2 to ayah 11 would land on 3:11.
    const { rerender } = render(<RouteWithHeader />);
    await screen.findAllByTestId('wbw-cell');
    fireEvent.click(await screen.findByTestId('wbw-next'));
    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 2, 11));

    mocks.params = { surahId: '3' };
    rerender(<RouteWithHeader />);

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 3, 1));
  });

  it('opens the sheet on the word that was tapped', async () => {
    render(<RouteWithHeader />);
    const cells = await screen.findAllByTestId('wbw-cell');

    fireEvent.click(cells[2]!);

    expect((await screen.findByTestId('word-sheet')).textContent).toContain('الكتاب');
  });

  it('takes the pager out of the header while the sheet is open', async () => {
    // The sheet and its dimming backdrop render inside the screen; the nav
    // header sits above them. A pager left up there stays lit and tappable
    // over the modal, so it comes out of the tree instead.
    render(<RouteWithHeader />);
    const cells = await screen.findAllByTestId('wbw-cell');
    expect(await screen.findByTestId('wbw-next')).toBeTruthy();

    fireEvent.click(cells[2]!);
    await screen.findByTestId('word-sheet');

    // waitFor: the header re-renders one commit after the sheet's state lands.
    await waitFor(() => expect(screen.queryByTestId('wbw-next')).toBeNull());
  });

  it('carries the tapped word\'s own ayah into the word-detail route', async () => {
    // `Word` holds ayah_id, not the ayah number the route is addressed by, so
    // the number has to come from the page the cell belongs to. Taking it from
    // the first page instead sends every deeper link to ayah 1.
    render(<RouteWithHeader />);
    const cells = await screen.findAllByTestId('wbw-cell');
    fireEvent.click(cells[1]!);
    await screen.findByTestId('word-sheet');

    fireEvent.click(screen.getByTestId('open-detail'));

    expect(mocks.push).toHaveBeenCalledWith('/word/2/2/2');
  });

  it('keeps the last word tapped when an earlier query resolves after it', async () => {
    // The grid puts ~150 tap targets on screen, so two taps are easily in
    // flight together. Last-resolved-wins shows the sheet for a word the
    // reader has already moved on from, with nothing to say the Arabic and the
    // grammar disagree.
    const first = deferred<WordSummary>();
    const second = deferred<WordSummary>();
    mocks.loadWordSummary
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    render(<RouteWithHeader />);
    const cells = await screen.findAllByTestId('wbw-cell');

    fireEvent.click(cells[1]!);
    fireEvent.click(cells[2]!);
    await act(async () => {
      second.resolve(summaryFor(word(3, 'الكتاب')));
      first.resolve(summaryFor(word(2, 'ذلك')));
    });

    expect(screen.getByTestId('word-sheet').textContent).toContain('الكتاب');
  });
});
