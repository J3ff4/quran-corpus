import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SurahsTab from '../../app/(tabs)/surahs';
import { deferred } from '../testing/deferred';
import type { SurahListItem } from '../data/corpusRepository';

const mocks = vi.hoisted(() => ({
  getSurahList: vi.fn(),
  getJuzIndex: vi.fn(),
  getPageIndex: vi.fn(),
  getRevealedIndex: vi.fn(),
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
  getJuzIndex: (...args: unknown[]) => mocks.getJuzIndex(...args),
  getPageIndex: (...args: unknown[]) => mocks.getPageIndex(...args),
  getRevealedIndex: (...args: unknown[]) => mocks.getRevealedIndex(...args),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: mocks.uiLocale, reduceMotion: false }),
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
  const rn = (await import('@/testing/rnHosts.js')).reactNativeTextMock();
  return {
    ...rn,
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
  };
});

const alFatihah = {
  id: 1,
  nameArabic: 'الفاتحة',
  nameTranslit: 'Al-Fatihah',
  nameTranslation: 'The Opener',
  ayahCount: 7,
} satisfies SurahListItem;

// Juz 3 rather than juz 2: juz 2 never leaves al-Baqarah, so a query that took
// the surah and the ayah from independent aggregates would answer correctly
// there and this assertion would hold against the bug. See the note in
// packages/data/tests/browse.test.ts.
const juz3 = {
  juz: 3,
  startSurahId: 2,
  startAyahNumber: 253,
  surahName: 'Al-Baqara',
  ayahCount: 126,
};
const page300 = { page: 300, startSurahId: 18, startAyahNumber: 54, surahName: 'Al-Kahf' };
const alAlaq = {
  surahId: 96,
  orderNumber: 1,
  revelationType: 'meccan' as const,
  nameArabic: 'العلق',
  nameTranslit: 'Al-Alaq',
};
const alBaqara = {
  surahId: 2,
  orderNumber: 87,
  revelationType: 'medinan' as const,
  nameArabic: 'البقرة',
  nameTranslit: 'Al-Baqara',
};

describe('SurahsTab', () => {
  beforeEach(() => {
    mocks.getSurahList.mockReset().mockResolvedValue([alFatihah]);
    mocks.getJuzIndex.mockReset().mockResolvedValue([juz3]);
    mocks.getPageIndex.mockReset().mockResolvedValue([page300]);
    mocks.getRevealedIndex.mockReset().mockResolvedValue([alAlaq, alBaqara]);
    mocks.push.mockReset();
    mocks.openCorpusDb = null;
    mocks.uiLocale = 'en';
  });

  afterEach(cleanup);

  it('shows the spinner until the corpus read resolves', async () => {
    const pending = deferred<SurahListItem[]>();
    mocks.getSurahList.mockReset().mockReturnValue(pending.promise);

    render(<SurahsTab />);

    expect(screen.getByText('loading')).toBeTruthy();

    pending.resolve([alFatihah]);
    await waitFor(() => expect(screen.getByText('Al-Fatihah')).toBeTruthy());
    expect(screen.queryByText('loading')).toBeNull();
  });

  it('opens the reader for the surah that was tapped', async () => {
    render(<SurahsTab />);

    fireEvent.click(await screen.findByText('Al-Fatihah'));

    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/surah/[surahId]',
      params: { surahId: '1' },
    });
  });

  it('clears an earlier failure when a later load succeeds', async () => {
    mocks.openCorpusDb = () => Promise.reject(new Error('no such table: surahs'));

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

  it('lists surahs by default', async () => {
    render(<SurahsTab />);

    expect(await screen.findByText('Al-Fatihah')).toBeTruthy();
    expect(mocks.getJuzIndex).not.toHaveBeenCalled();
  });

  it('switches to the juz index and opens the juz at the ayah it starts on', async () => {
    render(<SurahsTab />);
    await screen.findByText('Al-Fatihah');

    fireEvent.click(screen.getByTestId('segment-juz'));

    fireEvent.click(await screen.findByTestId('browse-juz-3'));
    // Decisions 18 and 20: every mode lands on a real ayah in the existing
    // reader. Opening at 2:1 would be a real ayah and the wrong one.
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/surah/[surahId]',
      params: { surahId: '2', ayah: '253' },
    });
  });

  it('opens a page at the ayah that page starts on', async () => {
    render(<SurahsTab />);
    await screen.findByText('Al-Fatihah');

    fireEvent.click(screen.getByTestId('segment-page'));

    fireEvent.click(await screen.findByTestId('browse-page-300'));
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/surah/[surahId]',
      params: { surahId: '18', ayah: '54' },
    });
  });

  it('groups the revealed list by Meccan and Medinan', async () => {
    render(<SurahsTab />);
    await screen.findByText('Al-Fatihah');

    fireEvent.click(screen.getByTestId('segment-revealed'));

    const headers = await screen.findAllByRole('header');
    expect(headers.map((header) => header.textContent)).toEqual(['Meccan', 'Medinan']);
  });

  it('loads each mode once and keeps it while the tab stays mounted', async () => {
    render(<SurahsTab />);
    await screen.findByText('Al-Fatihah');

    fireEvent.click(screen.getByTestId('segment-juz'));
    await screen.findByTestId('browse-juz-3');
    fireEvent.click(screen.getByTestId('segment-surah'));
    await screen.findByText('Al-Fatihah');
    fireEvent.click(screen.getByTestId('segment-juz'));
    await screen.findByTestId('browse-juz-3');

    // 604 page rows is not a query to re-run on every switch, and check 61
    // says the switch has to feel instant after the first load.
    expect(mocks.getJuzIndex).toHaveBeenCalledTimes(1);
    expect(mocks.getSurahList).toHaveBeenCalledTimes(1);
  });

  it('announces a localized failure when a mode fails to load', async () => {
    mocks.getJuzIndex.mockRejectedValue(new Error('no such column: juz'));
    render(<SurahsTab />);
    await screen.findByText('Al-Fatihah');

    fireEvent.click(screen.getByTestId('segment-juz'));

    await screen.findByRole('alert');
    expect(screen.getByText('Unable to load surahs')).toBeTruthy();
    expect(screen.queryByText('no such column: juz')).toBeNull();
  });

  it('leaves a failed mode behind when switching back to one already loaded', async () => {
    mocks.getJuzIndex.mockRejectedValue(new Error('no such column: juz'));
    render(<SurahsTab />);
    await screen.findByText('Al-Fatihah');

    fireEvent.click(screen.getByTestId('segment-juz'));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByTestId('segment-surah'));

    // The surah list is cached, so its load never re-runs -- an error cleared
    // only inside the load path would stay on screen over every other mode,
    // with nothing left that could clear it.
    expect(await screen.findByText('Al-Fatihah')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
