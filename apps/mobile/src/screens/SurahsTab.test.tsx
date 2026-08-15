import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SurahsTab from '../../app/(tabs)/surahs';
import { deferred } from '../testing/deferred';
import type { SurahListItem } from '../data/corpusRepository';

const mocks = vi.hoisted(() => ({
  getSurahList: vi.fn(),
  push: vi.fn(),
  openCorpusDb: null as (() => Promise<unknown>) | null,
  uiLocale: 'en',
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => (mocks.openCorpusDb ? mocks.openCorpusDb() : {}),
}));

vi.mock('@/data/corpusRepository', () => ({
  getSurahList: (...args: unknown[]) => mocks.getSurahList(...args),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: mocks.uiLocale }),
}));

vi.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mocks.push(...args) },
}));

// Stubbed rather than rendered: SurahList is covered by its own test, and
// FlatList would drag the whole react-native list runtime into a test that is
// about this screen's loading, failure and navigation branches.
vi.mock('@/components/SurahList', () => ({
  SurahList: ({ surahs, onOpenSurah }: { surahs: SurahListItem[]; onOpenSurah: (s: SurahListItem) => void }) => (
    <div>
      {surahs.map((surah) => (
        <button key={surah.id} type="button" onClick={() => onOpenSurah(surah)}>
          {surah.nameTranslit}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Text: ({ children, accessibilityRole }: { children?: React.ReactNode; accessibilityRole?: string }) =>
      React.createElement('span', { role: accessibilityRole }, children),
    View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  };
});

const alFatihah = { id: 1, nameTranslit: 'Al-Fatihah', ayahCount: 7 } as SurahListItem;

describe('SurahsTab', () => {
  beforeEach(() => {
    mocks.getSurahList.mockReset();
    mocks.push.mockReset();
    mocks.openCorpusDb = null;
    mocks.uiLocale = 'en';
  });

  afterEach(cleanup);

  it('shows the spinner until the corpus read resolves', async () => {
    const pending = deferred<SurahListItem[]>();
    mocks.getSurahList.mockReturnValue(pending.promise);

    render(<SurahsTab />);

    expect(screen.getByText('loading')).toBeTruthy();

    pending.resolve([alFatihah]);
    await waitFor(() => expect(screen.getByText('Al-Fatihah')).toBeTruthy());
    expect(screen.queryByText('loading')).toBeNull();
  });

  it('opens the reader for the surah that was tapped', async () => {
    mocks.getSurahList.mockResolvedValue([alFatihah]);

    render(<SurahsTab />);

    fireEvent.click(await screen.findByText('Al-Fatihah'));

    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/surah/[surahId]',
      params: { surahId: '1' },
    });
  });

  it('clears an earlier failure when a later load succeeds', async () => {
    mocks.openCorpusDb = () => Promise.reject(new Error('no such table: surahs'));
    mocks.getSurahList.mockResolvedValue([alFatihah]);

    const { rerender } = render(<SurahsTab />);
    await screen.findByRole('alert');

    // Changing the UI language reruns the effect. Without clearing the slot per
    // run, the stale error keeps rendering over the list this run just loaded.
    mocks.openCorpusDb = null;
    mocks.uiLocale = 'uz';
    rerender(<SurahsTab />);

    await waitFor(() => expect(screen.getByText('Al-Fatihah')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces a localized failure and clears the spinner', async () => {
    mocks.openCorpusDb = () => Promise.reject(new Error('no such table: surahs'));

    render(<SurahsTab />);

    await screen.findByRole('alert');
    expect(screen.getByText('Unable to load surahs')).toBeTruthy();
    // The driver's message is untranslated and can name a path on the device.
    expect(screen.queryByText('no such table: surahs')).toBeNull();
    // Both halves matter: a regression that leaves the spinner up forever, or
    // one that renders the error over a half-built list, would ship silently.
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.queryByText('Al-Fatihah')).toBeNull();
  });
});
