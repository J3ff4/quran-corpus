import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const React = await import('react');
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return {
    ...reactNativeTextMock(),
    ActivityIndicator: () => React.createElement('span', { 'data-testid': 'spinner' }),
    // Controllable, unlike the inert one rnHosts ships: a resume is the one
    // way this suite can make the screen re-read the user DB without
    // unmounting it, and re-reading is the whole point of doing it on focus.
    AppState: {
      addEventListener: (_event: string, listener: (state: string) => void) => {
        mocks.appStateListeners.push(listener);
        return { remove: () => {} };
      },
    },
  };
});

const mocks = vi.hoisted(() => ({
  readerProps: [] as Array<Record<string, unknown>>,
  playerProps: [] as Array<Record<string, unknown>>,
  // The layout rows of whichever page is asked for. The index cannot say which
  // ayah a page BEGINS -- that is the whole reason the screen reads the rows.
  pageLines: new Map<number, Array<{ words: Array<{ surahId: number; ayahNumber: number; position: number }> }>>(),
  sheetProps: [] as Array<Record<string, unknown>>,
  position: null as { surahId: number; ayahNumber: number; page: number | null } | null,
  bookmarks: [] as { surahId: number; ayahNumber: number; note: string | null }[],
  recordReadingPosition: vi.fn(),
  setBookmark: vi.fn(),
  setBookmarkNote: vi.fn(),
  useRecitation: vi.fn(),
  toggleAyah: vi.fn(),
  // The hook's two facts are separate on purpose: `ayah` is what the player is
  // parked on and outlives a pause, `playing` is whether sound is coming out.
  audio: { ayah: null as number | null, playing: false, finished: false },
  loadWordSummary: vi.fn(),
  loadFails: false,
  continuousPlay: false,
  focusTeardowns: [] as Array<() => void>,
  hideChrome: vi.fn(),
  releaseChrome: vi.fn(),
  appStateListeners: [] as Array<(state: string) => void>,
  // Whether the mushaf is the tab being looked at. A tab screen stays mounted
  // after a blur, so this is the difference between the screen's requests
  // applying and the screen sitting there quietly.
  isFocused: true,
  chromeVisible: true,
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

// useFocusEffect for real, not a stub: what this screen does on focus -- arm
// the chrome, release it on blur, re-read the bookmarks -- is exactly what a
// stubbed-out focus would stop testing.
vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    router: { push: vi.fn() },
    useIsFocused: () => mocks.isFocused,
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        const teardown = callback();
        // Kept so a test can run the BLUR half without unmounting: a tab screen
        // is not unmounted when the user leaves it, which is the whole reason
        // this is useFocusEffect and not useEffect.
        if (teardown) mocks.focusTeardowns.push(teardown);
        return teardown;
      }, [callback]);
    },
  };
});
vi.mock('@/components/mushaf/MushafChrome', () => ({ MushafChrome: () => null }));
vi.mock('@/mushaf/chromeVisibility', () => ({
  hideChrome: (...args: unknown[]) => mocks.hideChrome(...args),
  showChrome: vi.fn(),
  releaseChrome: (...args: unknown[]) => mocks.releaseChrome(...args),
  toggleChrome: vi.fn(),
  useChromeVisible: () => mocks.chromeVisible,
}));
vi.mock('@/components/mushaf/PageJumpSheet', () => ({ PageJumpSheet: () => null }));
vi.mock('@/components/ReciterSheet', () => ({ ReciterSheet: () => null }));
// Lagged, exactly like the real hook, and the lag is the point: rows are
// fetched in an effect, so the render in which the pager reports a turn still
// carries the PREVIOUS page's rows. A mock that answers from `page` directly
// cannot see a player acting on the page it has just left.
vi.mock('@/mushaf/useMushafPage', async () => {
  const React = await import('react');
  return {
    useMushafPage: (_client: unknown, page: number) => {
      const [state, setState] = React.useState<{
        lines: Array<{ words: Array<{ surahId: number; ayahNumber: number; position: number }> }>;
        page: number | null;
      }>({ lines: [], page: null });
      React.useEffect(() => {
        setState({ lines: mocks.pageLines.get(page) ?? [], page });
      }, [page]);
      return { ...state, loading: false, error: null };
    },
  };
});
// Captured rather than rendered, like the reader above. The player has its own
// suite; what this screen decides is WHICH ayah its play button starts. Also
// the only way to keep the real one out: it renders a RecitationBar, whose
// gesture handler is not mocked here.
vi.mock('@/components/mushaf/MushafPlayer', () => ({
  MushafPlayer: (props: Record<string, unknown>) => {
    mocks.playerProps.push(props);
    return null;
  },
}));

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
    return { ...mocks.audio, toggleAyah: mocks.toggleAyah };
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
    continuousPlay: mocks.continuousPlay,
  }),
}));

const indexPages = new Map([
  [1, { page: 1, startSurahId: 1, startAyahNumber: 1, surahName: 'Al-Fatihah', juz: 1 }],
  [106, { page: 106, startSurahId: 5, startAyahNumber: 82, surahName: 'Al-Maidah', juz: 6 }],
  [107, { page: 107, startSurahId: 5, startAyahNumber: 90, surahName: 'Al-Maidah', juz: 7 }],
  [604, { page: 604, startSurahId: 112, startAyahNumber: 1, surahName: 'Al-Ikhlas', juz: 30 }],
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
  mocks.playerProps = [];
  mocks.pageLines = new Map();
  mocks.sheetProps = [];
  mocks.position = null;
  mocks.bookmarks = [];
  mocks.loadFails = false;
  mocks.continuousPlay = false;
  mocks.focusTeardowns = [];
  mocks.appStateListeners = [];
  mocks.recordReadingPosition.mockClear();
  mocks.hideChrome.mockClear();
  mocks.releaseChrome.mockClear();
  mocks.toggleAyah.mockClear();
  mocks.audio = { ayah: null, playing: false, finished: false };
  mocks.isFocused = true;
  mocks.chromeVisible = true;
});

afterEach(cleanup);

async function renderScreen() {
  render(<MushafScreen />);
  await waitFor(() => expect(screen.getByTestId('mushaf-reader')).toBeTruthy());
  // The rows arrive in an effect, here as in the app, and the screen acts on
  // NOTHING until they match the page in view. Without this flush a test that
  // presses play races that effect and fails perhaps one run in ten.
  await act(async () => {});
  return () => mocks.readerProps.at(-1) ?? {};
}

/** The player's current props -- chiefly its `onTogglePlay`, which is the
 *  compact bar's play button and so the whole of what starts a page. */
function player() {
  return mocks.playerProps.at(-1) ?? {};
}

/** Move the playhead and let the screen re-render against it. The hook is
 *  mocked, so its value only changes when something else renders the screen --
 *  reporting the page it is already on is the smallest such nudge. */
async function park(
  props: () => Record<string, unknown>,
  audio: { ayah: number; playing: boolean; finished?: boolean },
) {
  mocks.audio = { finished: false, ...audio };
  await act(async () => {
    (props()['onPageChange'] as (page: number) => void)(
      (props()['initialPage'] as number),
    );
  });
}

/** A swipe: the pager is the truth about which page is in view. */
function turnTo(props: () => Record<string, unknown>, page: number) {
  act(() => {
    (props()['onPageChange'] as (page: number) => void)(page);
  });
}

function pressPlay() {
  act(() => {
    (player()['onTogglePlay'] as () => void)();
  });
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
    // Nothing is playing, so there is no surah to give the hook. The surah
    // travels with the toggle call instead -- see the test below.
    await renderScreen();

    expect(mocks.useRecitation).toHaveBeenCalledWith(null, 0, 'husary', expect.anything());
  });

  it('re-reads the bookmarks after the app comes back, rather than trusting the ones it started with', async () => {
    // A tab screen is never unmounted, so bookmarks read once at mount were
    // the ones that were true when the app launched. Bookmark a verse in the
    // Surahs tab, come back, and the sheet offered "add" for a verse that was
    // already saved -- and the toggle then wrote the opposite of the row.
    const props = await renderScreen();
    expect((props()['bookmarkedKeys'] as ReadonlySet<string>).size).toBe(0);

    mocks.bookmarks = [{ surahId: 5, ayahNumber: 3, note: 'later' }];
    await act(async () => {
      mocks.appStateListeners.forEach((listener) => listener('active'));
    });

    await waitFor(() =>
      expect((props()['bookmarkedKeys'] as ReadonlySet<string>).has('5:3')).toBe(true),
    );
  });

  it('arrives with the chrome hidden, page first', async () => {
    // Owner ruling 2026-09-10. The chrome is the app's tab bar as well, so an
    // arrival that showed it put a bar over the top and bottom of a page the
    // reader had just asked to see.
    await renderScreen();

    expect(mocks.hideChrome).toHaveBeenCalled();
  });

  it('gives the chrome back on BLUR, not only on unmount', async () => {
    // A tab screen stays mounted after the user leaves it, so a mount-scoped
    // release never ran: the 3.5s idle timer armed here went on to hide the
    // app's TAB BAR on whichever tab they had switched to -- a screen with no
    // control left to bring it back.
    await renderScreen();
    expect(mocks.releaseChrome).not.toHaveBeenCalled();

    // Every focus teardown on the screen, the bookmark re-read's included --
    // blur runs all of them, and only one of them is the chrome's.
    expect(mocks.focusTeardowns.length).toBeGreaterThan(0);
    act(() => mocks.focusTeardowns.forEach((teardown) => teardown()));

    expect(mocks.releaseChrome).toHaveBeenCalledTimes(1);
  });

  it('opens where the SURAH reader left off, which stores no page', async () => {
    // The reader writes `page: null` deliberately (ruling 13). Reading that as
    // "no position" opened the mushaf on the Fatiha for anyone whose last
    // session was in the reader -- the common path.
    mocks.position = { surahId: 5, ayahNumber: 85, page: null };
    const props = await renderScreen();

    expect(props()['initialPage']).toBe(106);
  });

  it('sounds the pressed word-s own surah, which the hook has not been told yet', async () => {
    // useRecitation was rendered with the PREVIOUS `playing`: null on the
    // first press, and the OTHER surah on a page carrying two. Nothing played
    // at all in the first case.
    mocks.position = { surahId: 4, ayahNumber: 176, page: 106 };
    const props = await renderScreen();

    const longPress = props()['onWordPress'] as (word: unknown, ayahId: number) => void;
    await act(async () => {
      longPress({ surahId: 5, ayahNumber: 2, position: 1, charType: 'word', glyph: '' }, 9);
    });

    const actions = mocks.sheetProps.at(-1)?.['ayahActions'] as {
      props: { onToggleAudio: () => void };
    };
    act(() => actions.props.onToggleAudio());

    expect(mocks.toggleAyah).toHaveBeenCalledWith(2, 5);
  });

  it('says the ayah is not playing once it is paused', async () => {
    // The screen's `playing` is which ayah the player sits ON, and it survives
    // a pause by design -- that is how resume knows where to go. Fed to the
    // sheet as though it meant sound, the control sat on Pause for ever: it
    // paused, and said it had not (owner, device, 2026-09-12).
    mocks.position = { surahId: 4, ayahNumber: 176, page: 106 };
    const props = await renderScreen();
    const longPress = props()['onWordPress'] as (word: unknown, ayahId: number) => void;
    const word = { surahId: 5, ayahNumber: 2, position: 1, charType: 'word', glyph: '' };
    const controls = () =>
      (mocks.sheetProps.at(-1)?.['ayahActions'] as { props: { playing: boolean } }).props;

    mocks.audio = { ayah: 2, playing: true, finished: false };
    await act(async () => longPress(word, 9));
    act(() => {
      (mocks.sheetProps.at(-1)?.['ayahActions'] as { props: { onToggleAudio: () => void } }).props
        .onToggleAudio();
    });
    // Re-opened rather than re-rendered by hand: the sheet's props are
    // rebuilt on the press above, and this is the screen's own way there.
    await act(async () => longPress(word, 9));
    expect(controls().playing).toBe(true);

    // The pause. `ayah` stays -- the player is still parked there.
    mocks.audio = { ayah: 2, playing: false, finished: false };
    await act(async () => longPress(word, 9));

    expect(controls().playing).toBe(false);
  });

  it('stops lighting the page-s ayah when the sound stops', async () => {
    // With the player hidden alongside the chrome, this highlight is the only
    // thing on screen saying audio is running. Left on the parked ayah it
    // claimed a paused page was reciting.
    mocks.position = { surahId: 4, ayahNumber: 176, page: 106 };
    const props = await renderScreen();
    const longPress = props()['onWordPress'] as (word: unknown, ayahId: number) => void;
    const word = { surahId: 5, ayahNumber: 2, position: 1, charType: 'word', glyph: '' };

    mocks.audio = { ayah: 2, playing: true, finished: false };
    await act(async () => longPress(word, 9));
    act(() => {
      (mocks.sheetProps.at(-1)?.['ayahActions'] as { props: { onToggleAudio: () => void } }).props
        .onToggleAudio();
    });
    expect(props()['playingAyah']).not.toBeNull();

    mocks.audio = { ayah: 2, playing: false, finished: false };
    await act(async () => longPress(word, 9));

    expect(props()['playingAyah']).toBeNull();
  });

  it('starts the page at the first ayah that begins on it', async () => {
    // The page opens on a tail carried over from the page before, and the tail
    // is not what plays: its opening is on the page the reader is not looking
    // at. Only the layout rows know -- the index's `startAyahNumber` IS that
    // tail.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [
      { words: [{ surahId: 5, ayahNumber: 82, position: 40 }] },
      { words: [{ surahId: 5, ayahNumber: 83, position: 1 }] },
      { words: [{ surahId: 5, ayahNumber: 84, position: 1 }] },
    ]);
    await renderScreen();

    pressPlay();

    expect(mocks.toggleAyah).toHaveBeenCalledWith(83, 5);
  });

  it('resumes the parked ayah instead of restarting the page', async () => {
    // Pausing shrinks the player back to one line, so its play button IS the
    // resume control. Without this, pause-then-play would throw the reader
    // back to the top of the page and pausing would be a trap.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [
      { words: [{ surahId: 5, ayahNumber: 82, position: 40 }] },
      { words: [{ surahId: 5, ayahNumber: 83, position: 1 }] },
      { words: [{ surahId: 5, ayahNumber: 84, position: 1 }] },
    ]);
    const props = await renderScreen();
    pressPlay();
    // Continuous has moved on an ayah and then been paused: the playhead is
    // parked on 84, which is not the ayah this page begins.
    await park(props, { ayah: 84, playing: false });
    mocks.toggleAyah.mockClear();

    pressPlay();

    expect(mocks.toggleAyah).toHaveBeenCalledWith(84, 5);
  });

  it('starts the page over when the parked ayah is not printed here', async () => {
    // Paused, then swiped on. Resuming an ayah that is not on the page in
    // front of the reader would sound something they cannot see.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [{ words: [{ surahId: 5, ayahNumber: 83, position: 1 }] }]);
    mocks.pageLines.set(107, [{ words: [{ surahId: 5, ayahNumber: 90, position: 1 }] }]);
    const props = await renderScreen();
    pressPlay();
    await park(props, { ayah: 83, playing: false });
    turnTo(props, 107);
    mocks.toggleAyah.mockClear();

    pressPlay();

    expect(mocks.toggleAyah).toHaveBeenCalledWith(90, 5);
  });

  it('pauses the sounding ayah rather than starting the page again', async () => {
    // The same button, and the same press, while sound is coming out: it has
    // to reach the ayah being recited even when the reader has swiped to a
    // page that begins somewhere else entirely.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [{ words: [{ surahId: 5, ayahNumber: 83, position: 1 }] }]);
    mocks.pageLines.set(107, [{ words: [{ surahId: 5, ayahNumber: 90, position: 1 }] }]);
    const props = await renderScreen();
    pressPlay();
    await park(props, { ayah: 83, playing: true });
    turnTo(props, 107);
    mocks.toggleAyah.mockClear();

    pressPlay();

    expect(mocks.toggleAyah).toHaveBeenCalledWith(83, 5);
  });

  it('hands the player the sound, not the parking spot', async () => {
    // The player shrinks back to one line on `playing` alone. Given the parked
    // ayah instead it would sit on the full transport for ever after the first
    // play, since the parking spot outlives a pause on purpose.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.audio = { ayah: 83, playing: false, finished: false };
    await renderScreen();

    expect(player()['playing']).toBe(false);
    expect(player()['ayahNumber']).toBe(83);
  });

  it('turns the page when the playhead runs off it', async () => {
    // The mushaf follows the voice: continuous has advanced past the last
    // ayah printed here, so the page has to catch up.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [{ words: [{ surahId: 5, ayahNumber: 83, position: 1 }] }]);
    const props = await renderScreen();
    pressPlay();

    await park(props, { ayah: 90, playing: true });

    expect(props()['focusPage']).toBe(107);
  });

  it('does not turn the page for an ayah still printed on it', async () => {
    // Continuous advances ayah by ayah, and most of those advances stay on the
    // page. A turn per ayah would flip a whole juz during one page's recitation.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [
      { words: [{ surahId: 5, ayahNumber: 83, position: 1 }] },
      { words: [{ surahId: 5, ayahNumber: 84, position: 1 }] },
    ]);
    const props = await renderScreen();
    pressPlay();

    await park(props, { ayah: 84, playing: true });

    expect(props()['focusPage']).toBeNull();
  });

  it('leaves the page alone once the reader swipes away mid-recitation', async () => {
    // The pager is the truth about which page is in view. A swipe leaves the
    // playhead on an ayah the new page does not carry -- the very state the
    // auto-turn reacts to -- so watching the page's rows here would drag the
    // reader forward again with every swipe.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [{ words: [{ surahId: 5, ayahNumber: 83, position: 1 }] }]);
    mocks.pageLines.set(1, [{ words: [{ surahId: 1, ayahNumber: 1, position: 1 }] }]);
    const props = await renderScreen();
    pressPlay();
    await park(props, { ayah: 83, playing: true });

    turnTo(props, 1);

    expect(props()['focusPage']).toBeNull();
  });

  it('carries the recitation over a surah seam the hook stops at', async () => {
    // `useRecitation` stops at the last ayah of a surah by design -- wrapping
    // would restart al-Fatiha behind a locked screen. 51 pages carry two
    // surahs, so at those the hook will not advance and the screen must.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [{ words: [{ surahId: 4, ayahNumber: 176, position: 1 }] }]);
    mocks.pageLines.set(107, [{ words: [{ surahId: 5, ayahNumber: 1, position: 1 }] }]);
    const props = await renderScreen();
    pressPlay();
    mocks.toggleAyah.mockClear();

    // The surah ran out: parked on its last ayah, silent, and finished.
    await park(props, { ayah: 176, playing: false, finished: true });
    expect(props()['focusPage']).toBe(107);

    // ...and the pager arrives, which is when the next page's rows do.
    turnTo(props, 107);

    expect(mocks.toggleAyah).toHaveBeenCalledWith(1, 5);
  });

  it('starts the page it turned to, never the one it just left', async () => {
    // The turn lands a render before the new page's rows do, so the screen is
    // still holding the OLD page's. Acting on those restarts the ayah that
    // just finished -- and then turns a page per ayah, because the playhead is
    // never on the page in view. Observed on device: page 1 finished, turned
    // to page 2, and recited al-Fatiha again there.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [{ words: [{ surahId: 4, ayahNumber: 176, position: 1 }] }]);
    mocks.pageLines.set(107, [{ words: [{ surahId: 5, ayahNumber: 1, position: 1 }] }]);
    const props = await renderScreen();
    pressPlay();

    await park(props, { ayah: 176, playing: false, finished: true });
    mocks.toggleAyah.mockClear();
    turnTo(props, 107);

    // There is a render in which the pager reports 107 while the rows still
    // say 106. Nothing may start off it -- 4:176 is the ayah that just
    // finished, and restarting it is the loop the reader saw.
    expect(mocks.toggleAyah).not.toHaveBeenCalledWith(176, 4);
    expect(mocks.toggleAyah).toHaveBeenCalledWith(1, 5);
  });

  it('finishes the surahs printed below the seam before turning', async () => {
    // A surah does not have to end where a page does: 54 pages carry two or
    // three. Page 106 ends surah 4 at 4:176 with 5:1 and 5:2 still printed
    // below it, and turning at `finished` skipped both -- on the page the
    // reader was looking at.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [
      { words: [{ surahId: 4, ayahNumber: 176, position: 1 }] },
      { words: [{ surahId: 5, ayahNumber: 1, position: 1 }] },
      { words: [{ surahId: 5, ayahNumber: 2, position: 1 }] },
    ]);
    const props = await renderScreen();
    pressPlay();
    mocks.toggleAyah.mockClear();

    await park(props, { ayah: 176, playing: false, finished: true });

    expect(mocks.toggleAyah).toHaveBeenCalledWith(1, 5);
    expect(props()['focusPage']).toBeNull();
  });

  it('does not ask for a page past the last one', async () => {
    // Page 604 holds 112, 113 and 114. The pager refuses a turn past 604, so a
    // request for 605 is never answered and the play that was waiting on it
    // waits for ever -- recitation dead, with two surahs still on screen.
    mocks.position = { surahId: 114, ayahNumber: 6, page: 604 };
    mocks.pageLines.set(604, [{ words: [{ surahId: 114, ayahNumber: 6, position: 1 }] }]);
    const props = await renderScreen();
    pressPlay();

    await park(props, { ayah: 6, playing: false, finished: true });

    expect(props()['focusPage']).toBeNull();
  });

  it('turns to the page the playhead is on, in either direction', async () => {
    // Previous from a page's first ayah lands on the page BEFORE. A fixed
    // forward step turned to 108 -- away from the ayah being recited, and two
    // pages off it.
    mocks.position = { surahId: 5, ayahNumber: 90, page: 107 };
    mocks.pageLines.set(107, [{ words: [{ surahId: 5, ayahNumber: 90, position: 1 }] }]);
    mocks.pageLines.set(106, [{ words: [{ surahId: 5, ayahNumber: 83, position: 1 }] }]);
    const props = await renderScreen();
    pressPlay();

    await park(props, { ayah: 83, playing: true });

    expect(props()['focusPage']).toBe(106);
  });

  it('drops a turn request the reader has swiped away from', async () => {
    // The seam asks for the next page and waits on its rows. If the reader
    // swipes elsewhere first, that request is stale: left standing it fires
    // minutes later, when a swipe happens to land on that page, and starts
    // reciting with nothing pressed.
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [{ words: [{ surahId: 4, ayahNumber: 176, position: 1 }] }]);
    mocks.pageLines.set(107, [{ words: [{ surahId: 5, ayahNumber: 1, position: 1 }] }]);
    mocks.pageLines.set(1, [{ words: [{ surahId: 1, ayahNumber: 1, position: 1 }] }]);
    const props = await renderScreen();
    pressPlay();
    await park(props, { ayah: 176, playing: false, finished: true });
    mocks.toggleAyah.mockClear();

    turnTo(props, 1);
    turnTo(props, 107);

    expect(mocks.toggleAyah).not.toHaveBeenCalled();
  });

  it('plays the page through with the continuous setting off', async () => {
    // The setting governs the reader, where play is a per-ayah control. Here
    // the only control says "Play this page", and a page is fifteen lines of
    // ayahs -- so it plays them, and the seam is turned at whatever the switch
    // in Settings reads.
    mocks.continuousPlay = false;
    mocks.position = { surahId: 5, ayahNumber: 82, page: 106 };
    mocks.pageLines.set(106, [{ words: [{ surahId: 4, ayahNumber: 176, position: 1 }] }]);
    const props = await renderScreen();
    pressPlay();

    expect(mocks.useRecitation).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ continuous: true }),
    );

    await park(props, { ayah: 176, playing: false, finished: true });

    expect(props()['focusPage']).toBe(107);
  });

  it('takes the system navigation buttons down with the rest of the chrome', async () => {
    // The page number is printed in the bottom corner of the leaf, which is
    // where three-button navigation lives (owner, on an S24, 2026-09-15). The
    // buttons therefore leave when the chrome does, so the reading state shows
    // the whole page.
    mocks.chromeVisible = false;
    await renderScreen();

    expect(screen.getByTestId('system-nav-bar').getAttribute('data-hidden')).toBe('true');
  });

  it('gives the buttons back when the chrome comes back', async () => {
    mocks.chromeVisible = true;
    await renderScreen();

    expect(screen.getByTestId('system-nav-bar').getAttribute('data-hidden')).toBe('false');
  });

  it('asks for nothing while another tab is the one on screen', async () => {
    // The mushaf is a TAB screen: it stays mounted after a blur. A request made
    // here and left standing would hide the navigation buttons on whatever tab
    // the reader moved to -- a screen with no tap-to-restore of its own, which
    // is the shape of the stranded tab bar (#80).
    mocks.chromeVisible = false;
    mocks.isFocused = false;
    await renderScreen();

    expect(screen.getByTestId('system-nav-bar').getAttribute('data-hidden')).toBe('false');
  });

  it('takes the status bar down with the navigation buttons', async () => {
    // Both system bars on one rule (M8 ruling 1). Separate assertions rather
    // than one: they are two independent native modules, and a screen that
    // hid one and forgot the other is exactly the defect this pairs against.
    mocks.chromeVisible = false;
    await renderScreen();

    expect(screen.getByTestId('system-status-bar').getAttribute('data-hidden')).toBe('true');
  });

  it('gives the status bar back when the chrome comes back', async () => {
    mocks.chromeVisible = true;
    await renderScreen();

    expect(screen.getByTestId('system-status-bar').getAttribute('data-hidden')).toBe('false');
  });

  it('leaves the status bar alone while another tab is the one on screen', async () => {
    // The status bar is app-wide state. A standing request from a blurred tab
    // would take the clock off whatever screen the reader moved to -- the #80
    // stranded-chrome shape, one window higher.
    mocks.chromeVisible = false;
    mocks.isFocused = false;
    await renderScreen();

    expect(screen.getByTestId('system-status-bar').getAttribute('data-hidden')).toBe('false');
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
