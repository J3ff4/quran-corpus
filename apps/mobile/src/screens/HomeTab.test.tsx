import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomeTab from '../../app/(tabs)/index';
import { localDay } from '../home/counters';
import { ayahForDay } from '../home/ayahOfTheDay';

// Real today, not a pinned date. The screen reads the device clock, and a
// fixture pinned to 2026-08-24 would make every streak case a broken streak the
// day after this was written -- the assertions would still pass, against 0.
const TODAY = localDay(new Date());
const daysAgo = (n: number) => localDay(new Date(Date.now() - n * 86_400_000));

const mocks = vi.hoisted(() => ({
  getLastReadingPosition: vi.fn(),
  getReadingDays: vi.fn(),
  getRootViewsByDay: vi.fn(),
  countDistinctRootsViewed: vi.fn(),
  getAyahReaderLocation: vi.fn(),
  push: vi.fn(),
  focusCallbacks: [] as Array<() => void | (() => void)>,
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('@/data/userDb', () => ({
  openUserDb: async () => ({}),
}));

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => ({}),
}));

vi.mock('@/data/userRepository', () => ({
  getLastReadingPosition: (...args: unknown[]) => mocks.getLastReadingPosition(...args),
  getReadingDays: (...args: unknown[]) => mocks.getReadingDays(...args),
  getRootViewsByDay: (...args: unknown[]) => mocks.getRootViewsByDay(...args),
  countDistinctRootsViewed: (...args: unknown[]) => mocks.countDistinctRootsViewed(...args),
}));

vi.mock('@/data/corpusRepository', () => ({
  getAyahReaderLocation: (...args: unknown[]) => mocks.getAyahReaderLocation(...args),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', contentLanguage: 'en', arabicScale: 'medium', reduceMotion: false }),
}));

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    router: { push: (...args: unknown[]) => mocks.push(...args) },
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        mocks.focusCallbacks.push(callback);
        return callback();
      }, [callback]);
    },
  };
});

vi.mock('react-native', async () => {
  const { host, StyleSheet } = await import('@/testing/rnHosts.js');
  const React = await import('react');
  return {
    // usePressScale -> useReducedMotion reads the system setting; every card
    // on this screen scales on press.
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => {} }),
    },
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Pressable: host('button'),
    ScrollView: host('div'),
    StyleSheet,
    Text: host('span'),
    View: host('div'),
  };
});

/** One ayah in the shape the reader repository returns. */
function readerAyah(surahId: number, ayahNumber: number) {
  return {
    surah: { id: surahId, name_arabic: 'ٱلْفَاتِحَة', name_translit: 'Al-Fatihah' },
    ayah: { id: ayahNumber, surah_id: surahId, ayah_number: ayahNumber, text_uthmani: 'بِسْمِ ٱللَّهِ' },
    translation: { text: 'In the name of Allah' },
  };
}

describe('HomeTab', () => {
  // Not automatic: this suite does not run with `globals: true`, so without it
  // every render stacks in the same document and a query for seven bars finds
  // seven per test that has run so far.
  afterEach(cleanup);

  beforeEach(() => {
    mocks.focusCallbacks = [];
    mocks.push.mockReset();
    mocks.getLastReadingPosition.mockReset().mockResolvedValue(null);
    mocks.getReadingDays.mockReset().mockResolvedValue([]);
    mocks.getRootViewsByDay.mockReset().mockResolvedValue([]);
    mocks.countDistinctRootsViewed.mockReset().mockResolvedValue(0);
    mocks.getAyahReaderLocation.mockReset().mockImplementation(
      async (_client: unknown, surahId: number, ayahNumber: number) => readerAyah(surahId, ayahNumber),
    );
  });

  it('shows the persisted reading position and refreshes it on focus', async () => {
    render(<HomeTab />);

    // Nothing read yet: the empty state is real, not the hardcoded string it
    // used to be regardless of history.
    await screen.findByText('No reading history yet');

    mocks.getLastReadingPosition.mockResolvedValue({ surahId: 2, ayahNumber: 255 });
    await act(async () => {
      // Every one of them: the screen registers a focus effect per load, so
      // firing only the last would refresh the counters and leave the reading
      // position showing whatever it held at mount.
      for (const callback of mocks.focusCallbacks) callback();
    });

    await waitFor(() => expect(screen.getByText('2:255')).toBeTruthy());
    expect(screen.queryByText('No reading history yet')).toBeNull();
  });

  it('opens the reader at the saved position, at that ayah rather than ayah 1', async () => {
    mocks.getLastReadingPosition.mockResolvedValue({ surahId: 2, ayahNumber: 255 });
    render(<HomeTab />);

    fireEvent.click(await screen.findByTestId('home-continue'));

    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/surah/[surahId]',
      params: { surahId: '2', ayah: '255' },
    });
  });

  it('surfaces a read failure instead of reporting an empty history', async () => {
    mocks.getLastReadingPosition.mockRejectedValue(new Error('user db is locked'));

    render(<HomeTab />);

    await waitFor(() => expect(screen.getByText('Unable to load reading history')).toBeTruthy());
    expect(screen.queryByText('No reading history yet')).toBeNull();
  });

  it('shows the streak the counters derive, not a raw row count', async () => {
    mocks.getReadingDays.mockResolvedValue([TODAY, daysAgo(1), daysAgo(4)]);

    render(<HomeTab />);

    // Three rows, two of them consecutive: the number on screen is the streak,
    // not the row count.
    expect((await screen.findByTestId('home-streak-value')).textContent).toBe('2');
  });

  it('asks for the whole reading history, not a window that would cap the streak', async () => {
    render(<HomeTab />);

    await waitFor(() => expect(mocks.getReadingDays).toHaveBeenCalled());
    // A streak has no window. Passing today-6 here would silently cap a
    // 40-day streak at 7 and there would be nothing on screen to say so.
    const [, sinceDay] = mocks.getReadingDays.mock.calls[0] as [unknown, string];
    expect(new Date(`${sinceDay}T00:00:00Z`).getTime()).toBeLessThan(Date.now() - 365 * 86_400_000);
  });

  it('shows seven bars in the weekly log even with one day of history', async () => {
    mocks.getRootViewsByDay.mockResolvedValue([{ day: TODAY, roots: 3 }]);

    render(<HomeTab />);

    expect(await screen.findAllByTestId(/^home-week-bar-/)).toHaveLength(7);
  });

  it('scales the bars against the busiest day of the week, not against themselves', async () => {
    mocks.getRootViewsByDay.mockResolvedValue([
      { day: TODAY, roots: 4 },
      { day: daysAgo(1), roots: 1 },
    ]);

    render(<HomeTab />);

    const bars = await screen.findAllByTestId(/^home-week-bar-/);
    // Oldest first, so today is last and yesterday second to last. Dividing
    // each day by its own count would make every non-empty bar full height.
    const height = (node: HTMLElement) => Number.parseFloat(node.style.height);
    expect(height(bars[6]!)).toBeGreaterThan(height(bars[5]!));
  });

  it('shows every root ever opened, not just this week', async () => {
    mocks.countDistinctRootsViewed.mockResolvedValue(42);
    mocks.getRootViewsByDay.mockResolvedValue([{ day: TODAY, roots: 3 }]);

    render(<HomeTab />);

    expect((await screen.findByTestId('home-roots-value')).textContent).toBe('42');
  });

  it('renders the counters even when the reading position fails to load', async () => {
    // Three independent loads on one screen. Before this, one rejected query
    // blanked the whole tab.
    mocks.getLastReadingPosition.mockRejectedValue(new Error('nope'));
    mocks.getReadingDays.mockResolvedValue([TODAY]);

    render(<HomeTab />);

    expect((await screen.findByTestId('home-streak-value')).textContent).toBe('1');
    expect(screen.getByText('Unable to load reading history')).toBeTruthy();
  });

  it('keeps the reading position when the counters fail to load', async () => {
    mocks.getLastReadingPosition.mockResolvedValue({ surahId: 2, ayahNumber: 255 });
    mocks.getReadingDays.mockRejectedValue(new Error('nope'));

    render(<HomeTab />);

    await screen.findByText('Unable to load your counters');
    expect(screen.getByText('2:255')).toBeTruthy();
  });

  it("opens the reader at the day's ayah", async () => {
    const expected = ayahForDay(TODAY);

    render(<HomeTab />);

    fireEvent.click(await screen.findByTestId('home-ayah-of-day'));

    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/surah/[surahId]',
      params: { surahId: String(expected.surah), ayah: String(expected.ayah) },
    });
  });

  it("renders the day's ayah in the reader's own text, not a placeholder", async () => {
    const expected = ayahForDay(TODAY);

    render(<HomeTab />);

    await screen.findByTestId('home-ayah-of-day');
    expect(mocks.getAyahReaderLocation).toHaveBeenCalledWith({}, expected.surah, expected.ayah, 'en');
  });

  it('still renders the ayah card when the corpus read fails', async () => {
    mocks.getAyahReaderLocation.mockRejectedValue(new Error('bundled db missing'));

    render(<HomeTab />);

    // The card is the tap target for the day's ayah; losing its text must not
    // lose the way in to it.
    await screen.findByText('Unable to load surah');
    fireEvent.click(screen.getByTestId('home-ayah-of-day'));
    expect(mocks.push).toHaveBeenCalled();
  });

  it('still opens search', async () => {
    render(<HomeTab />);

    fireEvent.click(await screen.findByTestId('open-search'));

    expect(mocks.push).toHaveBeenCalledWith('/search');
  });
});
