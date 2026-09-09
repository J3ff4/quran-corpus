import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const React = await import('react');
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return {
    ...reactNativeTextMock(),
    ActivityIndicator: () => React.createElement('span', { 'data-testid': 'spinner' }),
  };
});

const mocks = vi.hoisted(() => ({
  readerProps: [] as Array<Record<string, unknown>>,
  sheetProps: [] as Array<Record<string, unknown>>,
  position: null as { surahId: number; ayahNumber: number; page: number | null } | null,
  bookmarks: [] as { surahId: number; ayahNumber: number; note: string | null }[],
  recordReadingPosition: vi.fn(),
  setBookmark: vi.fn(),
  setBookmarkNote: vi.fn(),
  useRecitation: vi.fn(),
  toggleAyah: vi.fn(),
  loadWordSummary: vi.fn(),
  loadFails: false,
}));

// The reader half has its own suite; what this screen does is decide what it
// is handed, and what a page turn writes.
vi.mock('@/components/mushaf/MushafReader', async () => {
  const React = await import('react');
  return {
    MushafReader: (props: Record<string, unknown>) => {
      mocks.readerProps.push(props);
      return React.createElement('div', { 'data-testid': 'mushaf-reader' });
    },
  };
});

// Captured rather than rendered: WordSheet has its own suite, and what this
// screen decides is which coordinate the actions it builds are keyed to.
vi.mock('@/components/WordSheet', () => ({
  WordSheet: (props: Record<string, unknown>) => {
    mocks.sheetProps.push(props);
    return null;
  },
}));

vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('@/components/mushaf/MushafChrome', () => ({ MushafChrome: () => null }));
vi.mock('@/components/mushaf/PageJumpSheet', () => ({ PageJumpSheet: () => null }));

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: () => (mocks.loadFails ? Promise.reject(new Error('no db')) : Promise.resolve({})),
}));
vi.mock('@/data/userDb', () => ({ openUserDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
vi.mock('@/data/userRepository', () => ({
  getLastReadingPosition: () => Promise.resolve(mocks.position),
  getBookmarks: () => Promise.resolve(mocks.bookmarks),
  recordReadingPosition: (...args: unknown[]) => {
    mocks.recordReadingPosition(...args);
    return Promise.resolve();
  },
  setBookmark: (...args: unknown[]) => {
    mocks.setBookmark(...args);
    return Promise.resolve();
  },
  setBookmarkNote: (...args: unknown[]) => {
    mocks.setBookmarkNote(...args);
    return Promise.resolve();
  },
}));
vi.mock('@/audio/ayahAudio', () => ({
  useRecitation: (...args: unknown[]) => {
    mocks.useRecitation(...args);
    return { ayah: null, playing: false, toggleAyah: mocks.toggleAyah };
  },
}));
vi.mock('@/components/AyahControls', () => ({ AyahControls: () => null }));
vi.mock('@/components/NoteEditor', () => ({ NoteEditor: () => null }));
vi.mock('@/data/corpusRepository', () => ({
  getWordsForAyah: () => Promise.resolve([{ id: 91, ayah_id: 9, position: 1 }]),
}));
vi.mock('@/data/useWordSummaryLoader', () => ({
  useWordSummaryLoader: () => (word: unknown, surahId: number) => {
    mocks.loadWordSummary(word, surahId);
    return Promise.resolve({ word, segments: [], gloss: null });
  },
}));
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    uiLocale: 'en',
    contentLanguage: 'en',
    reciterId: 'husary',
    continuousPlay: false,
  }),
}));

const indexPages = new Map([
  [1, { page: 1, startSurahId: 1, startAyahNumber: 1, surahName: 'Al-Fatihah', juz: 1 }],
  [106, { page: 106, startSurahId: 5, startAyahNumber: 82, surahName: 'Al-Maidah', juz: 6 }],
  [107, { page: 107, startSurahId: 5, startAyahNumber: 90, surahName: 'Al-Maidah', juz: 7 }],
]);
vi.mock('@/mushaf/mushafReaderData', () => ({
  useMushafIndex: () => ({
    pages: indexPages,
    surahNames: new Map([[4, 'An-Nisa'], [5, 'Al-Maidah']]),
    ayahCounts: new Map([[4, 176], [5, 120]]),
    ready: true,
  }),
}));

import { MushafScreen } from './MushafScreen';

beforeEach(() => {
  mocks.readerProps = [];
  mocks.sheetProps = [];
  mocks.position = null;
  mocks.bookmarks = [];
  mocks.loadFails = false;
  mocks.recordReadingPosition.mockClear();
});

afterEach(cleanup);

async function renderScreen() {
  render(<MushafScreen />);
  await waitFor(() => expect(screen.getByTestId('mushaf-reader')).toBeTruthy());
  return () => mocks.readerProps.at(-1) ?? {};
}

describe('MushafScreen', () => {
  it('opens on the page the reader left off on', async () => {
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    const props = await renderScreen();

    expect(props()['initialPage']).toBe(106);
  });

  it('opens on the Fatiha when nothing has been read', async () => {
    const props = await renderScreen();

    expect(props()['initialPage']).toBe(1);
  });

  it('opens on the Fatiha when the databases cannot be read at all', async () => {
    // The tab still has to draw something. A screen stuck on its spinner is
    // indistinguishable from a hung app.
    mocks.loadFails = true;
    const props = await renderScreen();

    expect(props()['initialPage']).toBe(1);
  });

  it('records a page turn against the page-s own opening ayah', async () => {
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    const props = await renderScreen();

    const turn = props()['onPageChange'] as (page: number) => void;
    await act(async () => turn(107));

    // Ruling 13: one position row, shared with the surah reader, and the
    // coordinate is the page's own -- not the one it was opened on.
    await waitFor(() =>
      expect(mocks.recordReadingPosition).toHaveBeenCalledWith(expect.anything(), {
        surahId: 5,
        ayahNumber: 90,
        page: 107,
      }),
    );
  });

  it('acts on the word-s own surah, not the page-s first (#61)', async () => {
    // Page 106 opens in An-Nisa and heads Al-Ma'idah. Long-press a word of the
    // SECOND surah and every control in the sheet has to be keyed to it: a tab
    // has no route surah to fall back on, which is the whole of #61.
    mocks.position = { surahId: 4, ayahNumber: 176, page: 106 };
    const props = await renderScreen();

    const longPress = props()['onWordPress'] as (word: unknown, ayahId: number) => void;
    await act(async () => {
      longPress({ surahId: 5, ayahNumber: 2, position: 1, charType: 'word', glyph: '' }, 9);
    });

    expect(mocks.loadWordSummary).toHaveBeenCalledWith(expect.anything(), 5);
    await waitFor(() =>
      expect(mocks.sheetProps.at(-1)?.['ayahLabel']).toContain('5:2'),
    );
    expect(mocks.sheetProps.at(-1)?.['ayahActions']).toBeTruthy();
  });

  it('starts the recitation with no surah, since a tab has none to assume', async () => {
    // The hook reads `surah` when it starts an ayah rather than at mount,
    // which is what lets the screen hand it whichever surah was pressed.
    await renderScreen();

    expect(mocks.useRecitation).toHaveBeenCalledWith(null, 0, 'husary', expect.anything());
  });

  it('carries every bookmark, not one surah-s worth', async () => {
    // A page holds whatever surahs print put on it. A set narrowed to the
    // screen's "own" surah -- which a tab does not have -- drops exactly the
    // bookmarks belonging to the second surah on the page.
    mocks.bookmarks = [
      { surahId: 4, ayahNumber: 176, note: null },
      { surahId: 5, ayahNumber: 1, note: null },
    ];
    const props = await renderScreen();

    const keys = props()['bookmarkedKeys'] as ReadonlySet<string>;
    expect(keys.has('4:176')).toBe(true);
    expect(keys.has('5:1')).toBe(true);
  });
});
