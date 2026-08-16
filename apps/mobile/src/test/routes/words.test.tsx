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
  loadWordSummary: vi.fn(),
  push: vi.fn(),
}));

vi.mock('expo-router', () => ({
  router: { push: mocks.push },
  useLocalSearchParams: () => mocks.params,
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
  return { ...actual, getWbwScreen: (...args: unknown[]) => mocks.getWbwScreen(...args) };
});

vi.mock('@/data/useWordSummaryLoader', () => ({
  useWordSummaryLoader: () => mocks.loadWordSummary,
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ contentLanguage: 'en', uiLocale: 'en' }),
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
  const { host } = await import('@/testing/rnHosts.js');

  return {
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
    mocks.params = { surahId: '2' };
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

    fireEvent.click(screen.getByTestId('wbw-next'));

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 2, 11));
  });

  it('starts over at the range the new params name after an in-app navigation', async () => {
    // expo-router reuses this component for the next push to the same route,
    // so a paged-to position survives unless the params reset it -- opening
    // surah 3 after paging surah 2 to ayah 11 would land on 3:11.
    const { rerender } = render(<WbwRoute />);
    await screen.findAllByTestId('wbw-cell');
    fireEvent.click(screen.getByTestId('wbw-next'));
    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 2, 11));

    mocks.params = { surahId: '3' };
    rerender(<WbwRoute />);

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 3, 1));
  });

  it('opens the sheet on the word that was tapped', async () => {
    render(<WbwRoute />);
    const cells = await screen.findAllByTestId('wbw-cell');

    fireEvent.click(cells[2]!);

    expect((await screen.findByTestId('word-sheet')).textContent).toContain('الكتاب');
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
