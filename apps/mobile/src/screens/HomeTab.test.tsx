import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomeTab from '../../app/(tabs)/index';
import { localDay } from '../home/counters';
import { takeMushafPage } from '../mushaf/pageRequest';
import { ayahForDay } from '../home/ayahOfTheDay';

// Real today, not a pinned date. The screen reads the device clock, and a
// fixture pinned to 2026-08-24 would make every streak case a broken streak the
// day after this was written -- the assertions would still pass, against 0.
const TODAY = localDay(new Date());
const daysAgo = (n: number) => localDay(new Date(Date.now() - n * 86_400_000));

const mocks = vi.hoisted(() => ({
  getLastReadingPosition: vi.fn(),
  getKhatmPage: vi.fn(),
  getRootViewsByDay: vi.fn(),
  countDistinctRootsViewed: vi.fn(),
  getAyahReaderLocation: vi.fn(),
  push: vi.fn(),
  navigate: vi.fn(),
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
  getKhatmPage: (...args: unknown[]) => mocks.getKhatmPage(...args),
  getRootViewsByDay: (...args: unknown[]) => mocks.getRootViewsByDay(...args),
  countDistinctRootsViewed: (...args: unknown[]) => mocks.countDistinctRootsViewed(...args),
}));

vi.mock('@/data/corpusRepository', () => ({
  getAyahReaderLocation: (...args: unknown[]) => mocks.getAyahReaderLocation(...args),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    uiLocale: 'en',
    contentLanguage: 'uz',
    queryLanguage: 'uz-Cyrl',
    // Unequal to queryLanguage: the card's surah name follows the UI locale,
    // the ayah's translation follows the content language (#83).
    nameLanguage: 'ru',
    arabicScale: 'medium',
    reduceMotion: false,
  }),
}));

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    router: {
      push: (...args: unknown[]) => mocks.push(...args),
      // The khatm card switches TABS, which is navigate and not push.
      navigate: (...args: unknown[]) => mocks.navigate(...args),
    },
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        mocks.focusCallbacks.push(callback);
        return callback();
      }, [callback]);
    },
  };
});

// Home draws a player card now, and the transport inside it uses a pan gesture
// for its scrub track. Unmocked, Vite parses gesture-handler's own Flow-typed
// source and the suite fails to COLLECT -- which reads as a broken test file
// rather than as a missing mock (see Bloom.test.tsx for the same trap).
// The engine lives in a provider at the app root, which this suite renders the
// tab without. Mocked rather than wrapped: what the card does with the
// controller is HomePlayerCard's own suite to assert, and a real provider here
// would drag expo-audio's native module into a test about counters and streaks.
vi.mock('@/audio/recitationContext', () => ({
  useRecitationController: () => ({
    track: null,
    ayah: null,
    playing: false,
    positionSec: 0,
    durationSec: Number.NaN,
    finished: false,
    continuous: false,
    error: null,
    toggle: vi.fn(),
    stop: vi.fn(),
    seekTo: vi.fn(),
    skipNext: vi.fn(),
    skipPrevious: vi.fn(),
  }),
}));

vi.mock('react-native-gesture-handler', async () =>
  (await import('@/testing/rnHosts.js')).reactNativeGestureHandlerMock(),
);

vi.mock('react-native', async () => {
  const { AppState, host, StyleSheet } = await import('@/testing/rnHosts.js');
  const React = await import('react');
  return {
    // usePressScale -> useReducedMotion reads the system setting; every card
    // on this screen scales on press.
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => {} }),
    },
    AppState,
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
    mocks.navigate.mockReset();
    // Module state: a request one test leaves behind is visible to the next.
    takeMushafPage();
    mocks.getLastReadingPosition.mockReset().mockResolvedValue(null);
    mocks.getKhatmPage.mockReset().mockResolvedValue(null);
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

    // Two of them: Continue reading and the Listen card under it both name the
    // saved coordinate now.
    await waitFor(() => expect(screen.getAllByText('2:255')).toHaveLength(2));
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

  it('announces the weekly log once, with a total rather than seven raw dates', async () => {
    mocks.getRootViewsByDay.mockResolvedValue([
      { day: TODAY, roots: 3 },
      { day: daysAgo(1), roots: 1 },
    ]);

    render(<HomeTab />);

    // One node for the row. A label on a container React Native never exposes
    // is a label nobody hears, and seven bars each announcing an ISO date is
    // seven swipes of noise.
    await screen.findByLabelText('Roots this week: 4');
    const bars = await screen.findAllByTestId(/^home-week-bar-/);
    expect(bars.every((bar) => bar.getAttribute('aria-label') === null)).toBe(true);
  });

  it('says so when the continue card cannot read its ayah from the corpus', async () => {
    mocks.getLastReadingPosition.mockResolvedValue({ surahId: 2, ayahNumber: 255 });
    mocks.getAyahReaderLocation.mockRejectedValue(new Error('bundled db missing'));

    render(<HomeTab />);

    // Without this the card renders an empty row where the surah name goes and
    // nothing anywhere says the read failed.
    await waitFor(() => expect(screen.getAllByText('Unable to load surah').length).toBe(2));
    expect(screen.getByTestId('home-continue')).toBeTruthy();
  });

  it('shows the khatm page where the day streak used to be', async () => {
    mocks.getKhatmPage.mockResolvedValue(418);

    render(<HomeTab />);

    expect((await screen.findByTestId('home-khatm-value')).textContent).toBe('418');
    expect(screen.getByText('Khatm page')).toBeTruthy();
  });

  it('invites a khatm when the file holds no mark', async () => {
    render(<HomeTab />);

    // The read has landed with nothing marked, which is the one state the
    // invitation is the truth in.
    expect((await screen.findByTestId('home-khatm-value')).textContent).toBe('Start khatm');
  });

  it('holds the dash rather than inviting a khatm while the mark is still loading', async () => {
    // Never resolves: the first paint of every cold launch looks like this.
    mocks.getKhatmPage.mockReturnValue(new Promise(() => {}));

    render(<HomeTab />);

    // "Start khatm" here would offer to start one the reader is already
    // halfway through, on every single launch.
    expect((await screen.findByTestId('home-khatm-value')).textContent).toBe('\u2014');
  });

  it('opens the mushaf tab AT the marked page', async () => {
    mocks.getKhatmPage.mockResolvedValue(418);

    render(<HomeTab />);
    fireEvent.click(await screen.findByTestId('home-khatm'));

    // The page has to travel, not just the destination: the mushaf otherwise
    // opens on the saved reading position, and reading past the mark
    // deliberately does not move it -- so without this the card lands
    // somewhere other than the khatm on every tap.
    expect(takeMushafPage()).toBe(418);
    // navigate, not push: pushing a tab stacks a second copy of it.
    expect(mocks.navigate).toHaveBeenCalledWith('/mushaf');
  });

  it('opens the mushaf with no page to jump to when nothing is marked', async () => {
    render(<HomeTab />);
    fireEvent.click(await screen.findByTestId('home-khatm'));

    // Page 1 would be wrong and the saved position is the mushaf's own
    // business: the invitation goes to the mushaf and leaves it where it opens.
    expect(takeMushafPage()).toBeNull();
    expect(mocks.navigate).toHaveBeenCalledWith('/mushaf');
  });

  it('still opens the mushaf when the mark cannot be read', async () => {
    mocks.getKhatmPage.mockRejectedValue(new Error('nope'));

    render(<HomeTab />);

    await screen.findByText('Unable to load the khatm mark');
    // NOT "Start khatm": an unreadable mark is not an absent one, and offering
    // to start a khatm over one the file may still hold is the single wrong
    // thing this card could say.
    expect(screen.getByTestId('home-khatm-value').textContent).toBe('\u2014');
    fireEvent.click(screen.getByTestId('home-khatm'));
    // Nothing here writes, so an unreadable mark costs the jump and nothing
    // else. The control that could OVERWRITE a khatm is the mushaf's own
    // chrome button, which gates on this error itself.
    expect(takeMushafPage()).toBeNull();
    expect(mocks.navigate).toHaveBeenCalledWith('/mushaf');
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
    mocks.countDistinctRootsViewed.mockResolvedValue(7);

    render(<HomeTab />);

    expect((await screen.findByTestId('home-roots-value')).textContent).toBe('7');
    expect(screen.getByText('Unable to load reading history')).toBeTruthy();
  });

  it('keeps the reading position when the counters fail to load', async () => {
    mocks.getLastReadingPosition.mockResolvedValue({ surahId: 2, ayahNumber: 255 });
    mocks.countDistinctRootsViewed.mockRejectedValue(new Error('nope'));

    render(<HomeTab />);

    await screen.findByText('Unable to load your counters');
    expect(screen.getAllByText('2:255').length).toBeGreaterThan(0);
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
    // The composed code, not the bare content language: the ayah of the day
    // is a verse translation like any other, so it follows the script.
    expect(mocks.getAyahReaderLocation).toHaveBeenCalledWith(
      {},
      expected.surah,
      expected.ayah,
      'uz-Cyrl',
      // And the surah NAME on the card follows the UI locale, not that (#83).
      'ru',
    );
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
