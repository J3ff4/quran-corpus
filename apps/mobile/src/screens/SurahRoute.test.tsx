import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SurahRoute from '../../app/surah/[surahId]';

const mocks = vi.hoisted(() => ({
  setBookmark: vi.fn(),
  recordReadingPosition: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ surahId: '2' }),
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('@/audio/ayahAudio', () => ({
  useAyahAudioController: () => ({
    audioEnabled: false,
    audioError: null,
    playingAyah: null,
    toggleAyah: vi.fn(),
  }),
}));

vi.mock('@/components/LanguageSelector', async () => {
  const React = await import('react');
  return {
    LanguageSelector: () => React.createElement('div', null, 'language-selector'),
  };
});

vi.mock('@/components/SurahReader', async () => {
  const React = await import('react');
  return {
    SurahReader: ({ onToggleBookmark, onReadingAyah }: {
      onToggleBookmark: (ayahNumber: number) => void;
      onReadingAyah?: (ayahNumber: number) => void;
    }) =>
      React.createElement(
        'div',
        null,
        React.createElement('span', null, 'reader-content'),
        React.createElement('button', { onClick: () => onToggleBookmark(255) }, 'bookmark'),
        React.createElement('button', { onClick: () => onReadingAyah?.(256) }, 'read ayah'),
      ),
  };
});

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => ({}),
}));

vi.mock('@/data/userDb', () => ({
  openUserDb: async () => ({}),
}));

vi.mock('@/data/corpusRepository', () => ({
  getSurahReader: async () => ({
    surah: { id: 2, name_arabic: 'البقرة', name_translit: 'Al-Baqarah', name_translation: 'The Cow', ayah_count: 286 },
    ayahs: [
      {
        ayah: { id: 8, surah_id: 2, ayah_number: 255, text_uthmani: 'الله لا إله إلا هو' },
        words: [],
        translation: { ayah_id: 8, language: 'en', translator: 'Saheeh International', text: 'Allah - there is no deity except Him' },
      },
    ],
  }),
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
    uiLocale: 'en',
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
  });

  it('keeps the reader visible when bookmark persistence fails', async () => {
    mocks.setBookmark.mockRejectedValue(new Error('bookmark write boom'));
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('bookmark'));

    await waitFor(() => expect(screen.getByText('bookmark write boom')).toBeTruthy());
    expect(screen.getByText('reader-content')).toBeTruthy();
  });

  it('keeps the reader visible when reading history persistence fails', async () => {
    mocks.recordReadingPosition.mockRejectedValue(new Error('reading position write boom'));
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('read ayah'));

    await waitFor(() => expect(screen.getByText('reading position write boom')).toBeTruthy());
    expect(screen.getByText('reader-content')).toBeTruthy();
  });

  it('clears stale mutation feedback after a later reading history write succeeds', async () => {
    const readingWrite = deferred<void>();
    mocks.setBookmark.mockRejectedValue(new Error('bookmark write boom'));
    mocks.recordReadingPosition.mockReturnValue(readingWrite.promise);
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('bookmark'));
    await waitFor(() => expect(screen.getByText('bookmark write boom')).toBeTruthy());

    fireEvent.click(screen.getByText('read ayah'));
    await waitFor(() => expect(mocks.recordReadingPosition).toHaveBeenCalled());
    expect(screen.queryByText('bookmark write boom')).toBeNull();

    readingWrite.resolve();
    await waitFor(async () => {
      await readingWrite.promise;
    });
    expect(screen.queryByText('bookmark write boom')).toBeNull();
    expect(screen.getByText('reader-content')).toBeTruthy();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
