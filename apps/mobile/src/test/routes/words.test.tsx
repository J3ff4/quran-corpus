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
  getReaderPosition: vi.fn((_surahId: number) => null as number | null),
  setReaderPosition: vi.fn((_surahId: number, _ayahNumber: number) => {}),
}));

vi.mock('expo-router', () => ({
  router: { push: mocks.push },
  useLocalSearchParams: () => mocks.params,
}));

// Mocked rather than exercised through the real singleton: this asserts what
// the screen publishes, and the store has its own suite.
vi.mock('@/data/readerPosition', () => ({
  getReaderPosition: (surahId: number) => mocks.getReaderPosition(surahId),
  setReaderPosition: (surahId: number, ayahNumber: number) =>
    mocks.setReaderPosition(surahId, ayahNumber),
}));

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
    mocks.getReaderPosition.mockReset().mockReturnValue(null);
    mocks.setReaderPosition.mockReset();
    // Module-level, so without this a test renders the previous test's header
    // -- a pager wired to a screen that has already unmounted.
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

    render(<WbwRoute />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mocks.getWbwScreen).not.toHaveBeenCalled();
  });

  it('asks for the range named by ?from=', async () => {
    mocks.params = { surahId: '2', from: '255' };

    render(<WbwRoute />);

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenCalledWith(expect.anything(), 2, 255));
  });

  it('ignores a ?from= that is not an ayah coordinate', async () => {
    // Untrusted input: the route is deep-linkable, so `from` has to be
    // validated even though the app writes its own links.
    mocks.params = { surahId: '2', from: '1e9' };

    render(<WbwRoute />);

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenCalledWith(expect.anything(), 2, 1));
  });

  it('renders the hybrid layout by default and remembers a switch to dense', async () => {
    mocks.params = { surahId: '2' };

    render(<WbwRoute />);
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

    render(<WbwRoute />);
    await screen.findAllByTestId('wbw-cell');

    expect(screen.getAllByTestId('wbw-dense-run').length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('wbw-wrap')).toHaveLength(0);
    expect(screen.queryAllByTestId('wbw-ayah-line')).toHaveLength(0);
  });

  it('gives every word its gloss, not the first one', async () => {
    mocks.params = { surahId: '2' };

    render(<WbwRoute />);
    await screen.findAllByTestId('wbw-cell');

    // The screen fetches one map for the whole surah and each cell looks its
    // own word up in it. Fanning the first entry out to every cell renders a
    // full, plausible, entirely wrong screen.
    expect(screen.getAllByTestId('wbw-gloss-1')[0]!.textContent).toBe('Allah');
    expect(screen.getAllByTestId('wbw-gloss-2')[0]!.textContent).toBe('not');
  });

  it('draws the surah name and the pager in the screen, not through setOptions', async () => {
    // Pushed to the nav header they reached only the reader's stack route: the
    // morphology tab runs headerShown: false, so on that entry point the surah
    // went unnamed and the ayah range could not be changed at all (issue #25).
    // This suite renders the route with no navigator around it, which is what
    // that tab amounts to -- so a regression to setOptions fails here.
    render(<WbwRoute />);
    await screen.findAllByTestId('wbw-cell');

    expect(screen.getByRole('header').textContent).toBe('Al-Baqarah');
    expect(screen.getByTestId('wbw-next')).toBeTruthy();
  });

  it('renders one cell per word across every page in range', async () => {
    render(<WbwRoute />);

    expect(await screen.findAllByTestId('wbw-cell')).toHaveLength(3);
  });

  it('shows the range the repository actually served, not the one requested', async () => {
    // getWbwScreen clamps a start past the end of the surah. Rendering the
    // requested range instead would label an al-Fatihah page "200-209".
    mocks.getWbwScreen.mockResolvedValue(screenData({ from: 7, to: 7 }));

    render(<WbwRoute />);

    expect(await screen.findByText('7–7')).toBeTruthy();
  });

  it('reloads at the next page when the pager advances', async () => {
    render(<WbwRoute />);
    await screen.findAllByTestId('wbw-cell');

    fireEvent.click(await screen.findByTestId('wbw-next'));

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 2, 11));
  });

  it('publishes the range it moves to as the shared reading position', async () => {
    render(<WbwRoute />);
    await screen.findAllByTestId('wbw-cell');

    fireEvent.click(await screen.findByTestId('wbw-next'));

    // So pressing back leaves the reader where this screen ended up rather
    // than where it started (D46). The new range, not the old one.
    await waitFor(() => expect(mocks.setReaderPosition).toHaveBeenCalledWith(2, 11));
  });

  it('starts over at the range the new params name after an in-app navigation', async () => {
    // expo-router reuses this component for the next push to the same route,
    // so a paged-to position survives unless the params reset it -- opening
    // surah 3 after paging surah 2 to ayah 11 would land on 3:11.
    const { rerender } = render(<WbwRoute />);
    await screen.findAllByTestId('wbw-cell');
    fireEvent.click(await screen.findByTestId('wbw-next'));
    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 2, 11));

    mocks.params = { surahId: '3' };
    rerender(<WbwRoute />);

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 3, 1));
  });

  it('pages to the next surah and restarts at its first ayah', async () => {
    mocks.params = { surahId: '2', from: '50' };
    render(<WbwRoute />);
    await screen.findAllByTestId('wbw-cell');

    fireEvent.click(screen.getByTestId('surah-next'));

    // Not 3:50: the range belongs to the surah it was read in, and a surah
    // shorter than the range would render empty.
    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 3, 1));
  });

  it('dims the previous chevron in al-Fatihah', async () => {
    mocks.params = { surahId: '1' };
    render(<WbwRoute />);
    await screen.findAllByTestId('wbw-cell');
    const calls = mocks.getWbwScreen.mock.calls.length;

    fireEvent.click(screen.getByTestId('surah-previous'));

    // D47: disabled, not hidden -- still there for TalkBack to announce.
    expect(screen.getByTestId('surah-previous')).toBeTruthy();
    expect(mocks.getWbwScreen.mock.calls.length).toBe(calls);
  });

  it('opens the sheet on the word that was tapped', async () => {
    render(<WbwRoute />);
    const cells = await screen.findAllByTestId('wbw-cell');

    fireEvent.click(cells[2]!);

    expect((await screen.findByTestId('word-sheet')).textContent).toContain('الكتاب');
  });

  it('hides the screen from TalkBack while the sheet is open', async () => {
    // accessibilityViewIsModal is iOS-only; without this the reader can swipe
    // straight past the sheet into the words and the pager behind it. The
    // pager used to be unmounted instead, because it lived in the nav header
    // and could not be wrapped -- rendered in the screen it is covered by the
    // same wrapper as everything else.
    render(<WbwRoute />);
    const cells = await screen.findAllByTestId('wbw-cell');
    const wrapper = () => screen.getByTestId('wbw-screen');
    expect(wrapper().getAttribute('data-hidden-from-a11y')).toBeNull();

    fireEvent.click(cells[2]!);
    await screen.findByTestId('word-sheet');

    expect(wrapper().getAttribute('data-hidden-from-a11y')).toBe('true');
    expect(screen.getByTestId('wbw-next')).toBeTruthy();
  });

  it('carries the tapped word\'s own ayah into the word-detail route', async () => {
    // `Word` holds ayah_id, not the ayah number the route is addressed by, so
    // the number has to come from the page the cell belongs to. Taking it from
    // the first page instead sends every deeper link to ayah 1.
    render(<WbwRoute />);
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

    render(<WbwRoute />);
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
