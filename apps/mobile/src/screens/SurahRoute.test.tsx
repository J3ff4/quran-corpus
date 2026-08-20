import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SurahRoute from '../../app/surah/[surahId]';
import { deferred } from '../testing/deferred';

const mocks = vi.hoisted(() => ({
  setBookmark: vi.fn(),
  recordReadingPosition: vi.fn(),
  uiLocale: 'en',
  getSurahReader: vi.fn(),
  getWordsForAyah: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ surahId: '2' }),
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('@/audio/ayahAudio', () => ({
  useAyahAudioController: () => ({
    audioEnabled: true,
    audioError: null,
    playingAyah: null,
    toggleAyah: vi.fn(),
  }),
}));

vi.mock('@/components/SurahReader', async () => {
  const React = await import('react');
  return {
    // `loadWords` is destructured and driven, not dropped: a function prop a
    // mock omits renders nothing, so no assertion in this file could ever see
    // it and the route's own loader would sit unexercised (F1).
    SurahReader: ({ onToggleBookmark, onReadingAyah, bookmarkedAyahs, loadWords }: {
      onToggleBookmark: (ayahNumber: number) => void;
      onReadingAyah?: (ayahNumber: number) => void;
      bookmarkedAyahs: Set<number>;
      loadWords: (ayahId: number) => Promise<unknown[]>;
    }) =>
      React.createElement(
        'div',
        null,
        React.createElement('span', null, 'reader-content'),
        React.createElement('span', null, `bookmarked:${[...bookmarkedAyahs].sort((a, b) => a - b).join(',')}`),
        React.createElement('button', { onClick: () => onToggleBookmark(255) }, 'bookmark'),
        React.createElement('button', { onClick: () => onToggleBookmark(257) }, 'bookmark other'),
        React.createElement('button', { onClick: () => onReadingAyah?.(256) }, 'read ayah'),
        React.createElement('button', { onClick: () => void loadWords(8) }, 'open word sheet'),
      ),
  };
});

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => ({}),
}));

vi.mock('@/data/userDb', () => ({
  openUserDb: async () => ({}),
}));

const readerFixture = {
    surah: { id: 2, name_arabic: 'البقرة', name_translit: 'Al-Baqarah', name_translation: 'The Cow', ayah_count: 286 },
    ayahs: [
      {
        ayah: { id: 8, surah_id: 2, ayah_number: 255, text_uthmani: 'الله لا إله إلا هو' },
        translation: { ayah_id: 8, language: 'en', translator: 'Saheeh International', text: 'Allah - there is no deity except Him' },
      },
    ],
};

vi.mock('@/data/corpusRepository', () => ({
  getSurahReader: (...args: unknown[]) => mocks.getSurahReader(...args),
  getWordsForAyah: (...args: unknown[]) => mocks.getWordsForAyah(...args),
}));

vi.mock('@/data/userRepository', () => ({
  getBookmarks: async () => [],
  setBookmark: (...args: unknown[]) => mocks.setBookmark(...args),
  recordReadingPosition: (...args: unknown[]) => mocks.recordReadingPosition(...args),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    contentLanguage: 'en',
    setContentLanguage: vi.fn(),
    uiLocale: mocks.uiLocale,
  }),
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
    View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  };
});

describe('SurahRoute', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.setBookmark.mockReset();
    mocks.recordReadingPosition.mockReset();
    mocks.uiLocale = 'en';
    mocks.getSurahReader.mockReset();
    mocks.getSurahReader.mockResolvedValue(readerFixture);
    mocks.getWordsForAyah.mockReset();
    mocks.getWordsForAyah.mockResolvedValue([]);
  });

  it('retranslates a load failure when the UI language changes', async () => {
    mocks.getSurahReader.mockRejectedValue(new Error('no such table: ayahs'));

    const { rerender } = render(<SurahRoute />);
    await screen.findByText('Unable to load surah');

    // The effect stores a string already translated with the locale it
    // captured, so it has to rerun when that locale changes -- otherwise the
    // failure stays in the previous language for as long as it is on screen.
    mocks.uiLocale = 'uz';
    rerender(<SurahRoute />);

    await waitFor(() => expect(screen.getByText('Surani yuklab bo\u2018lmadi')).toBeTruthy());
  });

  it('keeps the reader visible when bookmark persistence fails', async () => {
    mocks.setBookmark.mockRejectedValue(new Error('bookmark write boom'));
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('bookmark'));

    await waitFor(() => expect(screen.getByText('Unable to update bookmark')).toBeTruthy());
    expect(screen.getByText('reader-content')).toBeTruthy();
  });

  it('reverts only the failed ayah when another bookmark lands mid-write', async () => {
    const failingWrite = deferred<void>();
    mocks.setBookmark.mockImplementation((_client: unknown, _surahId: number, ayahNumber: number) =>
      ayahNumber === 255 ? failingWrite.promise : Promise.resolve(),
    );
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('bookmark'));
    fireEvent.click(screen.getByText('bookmark other'));
    await waitFor(() => expect(screen.getByText('bookmarked:255,257')).toBeTruthy());

    failingWrite.reject(new Error('bookmark write boom'));

    // 257 is committed in SQLite. Restoring a set snapshotted before 255's
    // write would drop it from the list too, and the reader would disagree
    // with the DB until the next focus reload.
    await waitFor(() => expect(screen.getByText('Unable to update bookmark')).toBeTruthy());
    expect(screen.getByText('bookmarked:257')).toBeTruthy();
  });

  it('keeps the reader visible when reading history persistence fails', async () => {
    mocks.recordReadingPosition.mockRejectedValue(new Error('reading position write boom'));
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('read ayah'));

    await waitFor(() => expect(screen.getByText('Unable to save reading position')).toBeTruthy());
    expect(screen.getByText('reader-content')).toBeTruthy();
  });

  it('keeps a bookmark failure on screen while background reading writes run', async () => {
    const readingWrite = deferred<void>();
    mocks.setBookmark.mockRejectedValue(new Error('bookmark write boom'));
    mocks.recordReadingPosition.mockReturnValue(readingWrite.promise);
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('bookmark'));
    await waitFor(() => expect(screen.getByText('Unable to update bookmark')).toBeTruthy());

    // Scrolling drives this write, so it must not clear feedback the user never
    // acknowledged -- their bookmark is still unsaved.
    fireEvent.click(screen.getByText('read ayah'));
    await waitFor(() => expect(mocks.recordReadingPosition).toHaveBeenCalled());
    expect(screen.getByText('Unable to update bookmark')).toBeTruthy();

    await act(async () => {
      readingWrite.resolve();
      await readingWrite.promise;
    });

    expect(screen.getByText('Unable to update bookmark')).toBeTruthy();
    expect(screen.getByText('reader-content')).toBeTruthy();
  });

  it('surfaces bookmark and reading failures independently', async () => {
    mocks.setBookmark.mockRejectedValue(new Error('bookmark write boom'));
    mocks.recordReadingPosition.mockRejectedValue(new Error('reading position write boom'));
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('bookmark'));
    await waitFor(() => expect(screen.getByText('Unable to update bookmark')).toBeTruthy());

    fireEvent.click(screen.getByText('read ayah'));
    await waitFor(() => expect(screen.getByText('Unable to save reading position')).toBeTruthy());
    expect(screen.getByText('Unable to update bookmark')).toBeTruthy();
  });

  it('loads a tapped ayah\'s words through the corpus client it opened', async () => {
    render(<SurahRoute />);
    await screen.findByText('reader-content');

    fireEvent.click(screen.getByText('open word sheet'));

    // The client, not undefined: `loadWords` closes over the client the reader
    // effect opened, and a route that hands the sheet a loader with no client
    // returns an empty word list on every tap -- an ayah that opens to nothing.
    await waitFor(() => expect(mocks.getWordsForAyah).toHaveBeenCalledWith({}, 8));
  });
});
