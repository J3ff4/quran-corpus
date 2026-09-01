import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryUserClient } from '../data/userRepository.testHelpers';
import { getBookmarks, setBookmark, setBookmarkNote } from '../data/userRepository';
import BookmarksTab from '../../app/bookmarks';

const mocks = vi.hoisted(() => ({
  userClient: null as ReturnType<typeof createMemoryUserClient> | null,
  openUserDb: null as (() => Promise<ReturnType<typeof createMemoryUserClient> | null>) | null,
  focusCallbacks: [] as Array<() => void | (() => void)>,
  ayahTexts: new Map() as Map<string, string>,
  /** Which list component the screen actually mounted. A testID on the
   *  container cannot answer this: a plain <View> carrying the same testID
   *  renders identically here, which is exactly the regression being guarded
   *  against. */
  listsUsed: [] as string[],
  /** Router pushes from a card press, so the whole-card target can be told
   *  apart from the coordinate Link inside it. */
  pushed: [] as unknown[][],
  /** Hold every withTiming completion instead of running it, so a test can
   *  look at the list mid-exit. Off by default: every other test wants the
   *  delete to resolve within its own act(). */
  holdTimings: false,
  heldTimings: [] as Array<(finished: boolean) => void>,
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

// One factory only: `@/data/userDb` and `../data/userDb` resolve to the same
// module, so a second vi.mock for the relative form is dead weight.
vi.mock('@/data/userDb', () => ({
  openUserDb: async () => (mocks.openUserDb ? mocks.openUserDb() : mocks.userClient),
}));

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => ({}),
}));

// The corpus half is stubbed rather than faked in SQL: what this screen owes
// the reader is the right rows in the right order with the right notes, and
// getAyahPreviews has its own tests in packages/data.
vi.mock('@/data/corpusRepository', () => ({
  getBookmarkAyahTexts: async () => mocks.ayahTexts,
  getSurahList: async () => [
    { id: 1, nameTranslit: 'Al-Fatiha' },
    { id: 2, nameTranslit: 'Al-Baqara' },
  ],
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }),
}));

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ children, accessibilityLabel }: { children?: React.ReactNode; accessibilityLabel?: string }) =>
      React.createElement('a', { 'aria-label': accessibilityLabel }, children),
    // The card's own press goes through the router; the Link inside it is what
    // TalkBack focuses. Both carry the same href -- see BookmarkRow.
    useRouter: () => ({ push: (...args: unknown[]) => mocks.pushed.push(args) }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        mocks.focusCallbacks.push(callback);
        return callback();
      }, [callback]);
    },
  };
});

// The swipe-to-delete wrapper. Renders the row and nothing else: the gesture
// itself is device-gated like every other one in this app (BottomSheet.test.tsx
// owns the only gesture assertions), and its delete panel calls exactly the
// handler the in-row control does -- which is what the suite below drives.
vi.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  default: ({ children }: { children?: React.ReactNode }) => children,
}));

// BottomSheet reaches reanimated and gesture-handler, neither of which parses
// under the test transform. The sheet's own behaviour is covered by
// BottomSheet.test.tsx; here it only has to render its children.
vi.mock('react-native-reanimated', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return {
    default: { View: host('div'), createAnimatedComponent: (Component: unknown) => Component },
    runOnJS: (fn: unknown) => fn,
    useAnimatedStyle: () => ({}),
    useSharedValue: (initial: unknown) => ({ value: initial }),
    withSpring: (to: unknown) => to,
    // The completion callback is run, not dropped. The bookmark exit chains
    // slide -> collapse -> onRemoved through exactly these callbacks, so a
    // mock that ignores them leaves every deleted row on screen -- and a test
    // that then asserted the row was gone would be asserting the mock.
    withTiming: (to: unknown, _config: unknown, callback?: (finished: boolean) => void) => {
      if (!callback) return to;
      if (mocks.holdTimings) mocks.heldTimings.push(callback);
      else callback(true);
      return to;
    },
    Easing: { cubic: (v: number) => v, in: (fn: unknown) => fn, out: (fn: unknown) => fn },
  };
});

vi.mock('react-native-gesture-handler', async () => {
  const { reactNativeGestureHandlerMock } = await import('@/testing/rnHosts.js');
  return reactNativeGestureHandlerMock();
});

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  const { host, AppState, FlatList, SectionList, Modal, StyleSheet, AccessibilityInfo, useWindowDimensions } =
    await import('@/testing/rnHosts.js');

  const Input = ({
    onChangeText,
    value,
    accessibilityLabel,
    testID,
  }: {
    onChangeText?: (text: string) => void;
    value?: string;
    accessibilityLabel?: string;
    testID?: string;
  }) =>
    React.createElement('input', {
      'data-testid': testID,
      'aria-label': accessibilityLabel,
      value: value ?? '',
      onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
    });

  return {
    AppState,
    AccessibilityInfo,
    useWindowDimensions,
    // The sheet subscribes to Android back. Inert here: BottomSheet.test.tsx
    // owns that behaviour, this suite only needs the sheet to mount.
    BackHandler: { addEventListener: () => ({ remove: () => {} }) },
    StyleSheet,
    Modal,
    FlatList: (props: Parameters<typeof FlatList>[0]) => {
      mocks.listsUsed.push('FlatList');
      return FlatList(props);
    },
    SectionList: (props: Parameters<typeof SectionList>[0]) => {
      mocks.listsUsed.push('SectionList');
      return SectionList(props);
    },
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Text: host('span'),
    TextInput: Input,
    View: host('div'),
    Pressable: host('button'),
    Animated: { View: host('div'), createAnimatedComponent: () => host('button') },
  };
});

/** Anchored at both ends on purpose: GlassSurface also emits a
 *  `<testID>-highlight` sibling for its inset rim, and an unanchored
 *  `/^bookmark-row-/` counts every row twice. */
const ROW_ID = /^bookmark-row-\d+-\d+$/;

function rowIds() {
  return screen.queryAllByTestId(ROW_ID).map((node) => node.getAttribute('data-testid'));
}

describe('BookmarksTab', () => {
  beforeEach(() => {
    mocks.userClient = createMemoryUserClient();
    mocks.openUserDb = null;
    mocks.focusCallbacks = [];
    mocks.ayahTexts = new Map();
    mocks.listsUsed = [];
    mocks.pushed = [];
    mocks.holdTimings = false;
    mocks.heldTimings = [];
  });

  afterEach(cleanup);

  it('refreshes persisted bookmarks when the tab regains focus', async () => {
    const userClient = requireUserClient();
    render(<BookmarksTab />);

    await screen.findByText('No bookmarks yet');
    await setBookmark(userClient, 2, 255, true);

    await act(async () => {
      mocks.focusCallbacks.at(-1)?.();
    });

    await waitFor(() => expect(screen.getByLabelText('Open Al-Baqara 2:255')).toBeTruthy());
  });

  it('renders the failure and clears the spinner when the user DB cannot open', async () => {
    mocks.openUserDb = async () => {
      throw new Error('database is locked');
    };

    render(<BookmarksTab />);

    await screen.findByText('Unable to load bookmarks');
    // Both halves matter: a regression that leaves the spinner up forever, or
    // one that renders the error alongside the empty state, would otherwise
    // ship silently.
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.queryByText('No bookmarks yet')).toBeNull();
  });

  it('renders the rows in a virtualizing list, not a plain view', async () => {
    // The defect found on the M5c device run: rows lived in a plain <View>, so
    // everything past the fold was unreachable on a real phone. This asserts
    // the container, which the rows themselves cannot reveal.
    const userClient = requireUserClient();
    for (let ayah = 1; ayah <= 60; ayah += 1) await setBookmark(userClient, 2, ayah, true);

    render(<BookmarksTab />);

    const list = await screen.findByTestId('bookmarks-list');
    expect(within(list).getAllByTestId(ROW_ID)).toHaveLength(60);
    // The container, not just the rows. Everything past the fold was
    // unreachable on device precisely because the rows looked fine.
    expect(mocks.listsUsed).toContain('FlatList');
  });

  it('shows only noted bookmarks under the With-notes tab', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    await setBookmark(userClient, 1, 1, true);
    await setBookmarkNote(userClient, 2, 255, 'throne');

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-2-255');

    fireEvent.click(screen.getByText('With notes'));

    expect(rowIds()).toEqual(['bookmark-row-2-255']);
  });

  it('orders Recent by when the bookmark was saved, not by surah', async () => {
    const userClient = requireUserClient();
    // The newest bookmark must be the one mushaf order puts LAST, or the two
    // orderings agree and the assertion passes without any re-sort happening.
    // 1:1 is saved first, 2:255 second: mushaf order is [1:1, 2:255], Recent is
    // the reverse.
    await setBookmark(userClient, 1, 1, true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await setBookmark(userClient, 2, 255, true);

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-1-1');

    expect(rowIds()).toEqual(['bookmark-row-2-255', 'bookmark-row-1-1']);
  });

  it('groups the By-surah tab under surah headers, in mushaf order', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    await setBookmark(userClient, 1, 1, true);

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-1-1');

    fireEvent.click(screen.getByText('By surah'));

    expect(mocks.listsUsed).toContain('SectionList');
    const headers = screen.getAllByRole('header').map((node) => node.textContent);
    expect(headers).toContain('Al-Fatiha');
    expect(headers).toContain('Al-Baqara');
    expect(headers.indexOf('Al-Fatiha')).toBeLessThan(headers.indexOf('Al-Baqara'));
  });

  it('names the ayah in the note sheet, not just its coordinate', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    render(<BookmarksTab />);
    fireEvent.click(await screen.findByTestId('bookmark-note-2-255'));
    // "2:255" alone identifies the ayah only to someone who knows the order.
    // { selector: 'span' } excludes the row's own "Open Al-Baqara 2:255" link
    // text, which is still in the DOM underneath the (inline-rendered) sheet.
    expect(await screen.findByText('Al-Baqara 2:255', { selector: 'span' })).toBeTruthy();
  });

  it('gives the note sheet buttons the 48dp floor', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    render(<BookmarksTab />);
    fireEvent.click(await screen.findByTestId('bookmark-note-2-255'));
    // The control that discarded a typed note was ~33dp.
    expect(screen.getByTestId('note-save').style.minHeight).toBe('48px');
    expect(screen.getByTestId('note-cancel').style.minHeight).toBe('48px');
  });

  it('counts down the remaining characters while editing', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);

    render(<BookmarksTab />);
    fireEvent.click(await screen.findByLabelText('Add note'));
    fireEvent.change(screen.getByTestId('note-input'), { target: { value: 'x'.repeat(495) } });

    // Silently truncating at the boundary is the version where a long note
    // loses its end with nothing on screen having said so.
    expect(screen.getByTestId('note-counter').textContent).toContain('5');
  });

  it('stores what normalizeNote kept, not what was typed', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);

    render(<BookmarksTab />);
    fireEvent.click(await screen.findByLabelText('Add note'));
    fireEvent.change(screen.getByTestId('note-input'), { target: { value: '  the throne verse  ' } });
    fireEvent.click(screen.getByLabelText('Save'));

    // Re-read from the DB, not patched into local state: the padding is gone
    // because the write boundary trimmed it, and the screen must agree with
    // what was stored rather than with what was typed.
    await waitFor(() => expect(screen.getByText('the throne verse')).toBeTruthy());
  });

  it('never puts the note itself into a log line when the write fails', async () => {
    // Decision 34: nothing new leaves the device. A note is exactly the kind of
    // string a log swallows -- telemetry.ts's own comment records
    // `source: <a user's note>` slipping past a key-only filter. The failure
    // path is the one that reaches for context, so it is the one to pin.
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);

    render(<BookmarksTab />);
    fireEvent.click(await screen.findByLabelText('Add note'));

    const secret = 'a private reflection';
    mocks.openUserDb = async () => {
      throw new Error('database is locked');
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    fireEvent.change(screen.getByTestId('note-input'), { target: { value: secret } });
    fireEvent.click(screen.getByLabelText('Save'));

    await screen.findByText('Unable to save the note');
    // Rendered by NoteEditor, which is the only component carrying this
    // testID. On device the sheet is a <Modal> in its own native window, so an
    // alert on the list behind it is drawn under the sheet and announced to
    // nobody; jsdom inlines the Modal, so the testID is what tells the two
    // apart here.
    expect(screen.getByTestId('note-error')).toBeTruthy();
    const everythingLogged = logged.mock.calls.map((call) => JSON.stringify(call)).join(' ');
    expect(everythingLogged).not.toContain(secret);
    // ...but the coordinate IS logged, or the line is useless for debugging.
    expect(everythingLogged).toContain('255');
    logged.mockRestore();
  });

  it('distinguishes an annotated row from an empty one by more than its label', async () => {
    // The label already differs, so TalkBack was fine; both glyphs used to be
    // '✎' in the same muted colour, so a sighted user could not tell which rows
    // carry a note. Now one glyph, filled or not -- same pair the reader uses.
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    await setBookmark(userClient, 2, 1, true);
    await setBookmarkNote(userClient, 2, 255, 'throne');

    render(<BookmarksTab />);

    const annotated = (await screen.findByLabelText('Edit note')).querySelector('svg');
    const empty = screen.getByLabelText('Add note').querySelector('svg');
    // Asserted as "filled vs not", not as two colours: colour alone would be a
    // 1.4.1 failure and would also pass if both were accent.
    expect(annotated?.getAttribute('fill')).not.toBe('none');
    expect(empty?.getAttribute('fill')).toBe('none');
  });

  it('names the surah in the flat tabs and leaves it to the header under By surah', async () => {
    // "2:255" identifies the ayah only to someone who already knows the surah
    // order. Under By surah the section header carries the name, so a row that
    // repeated it would be the header read twice.
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-2-255');
    expect(screen.getByLabelText('Open Al-Baqara 2:255')).toBeTruthy();

    fireEvent.click(screen.getByText('By surah'));

    expect(screen.getByLabelText('Open 2:255')).toBeTruthy();
    expect(screen.queryByLabelText('Open Al-Baqara 2:255')).toBeNull();
  });

  it('opens the ayah from anywhere on the card, not only the coordinate', async () => {
    // The coordinate alone measured 81x76px on a 640dpi device (2026-08-29).
    // The card is the target now; the Link inside it is what TalkBack focuses.
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);

    render(<BookmarksTab />);
    // Reached by testID rather than by role: the card is accessible={false} on
    // purpose, because an accessible container collapses its children on
    // Android and would take the note and delete buttons off TalkBack.
    //
    // React DOM warns "<button> cannot contain a nested <button>" here. That is
    // the shim, not the app: rnHosts renders every Pressable as a <button>, and
    // React Native has no such restriction -- a control inside a pressable card
    // is the layout this row is.
    fireEvent.click(await screen.findByTestId('bookmark-card-2-255'));

    expect(mocks.pushed).toHaveLength(1);
    expect(JSON.stringify(mocks.pushed[0])).toContain('255');
  });

  it('deletes an un-noted bookmark without asking', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    await setBookmark(userClient, 1, 1, true);

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-2-255');

    fireEvent.click(screen.getByTestId('bookmark-delete-2-255'));

    // Gone from the list AND gone from the database. The list alone would pass
    // against a row spliced out of local state by a write that never ran.
    await waitFor(() => expect(rowIds()).toEqual(['bookmark-row-1-1']));
    expect(await getBookmarks(userClient)).toHaveLength(1);
  });

  it('holds the deleted row on screen until its exit has played', async () => {
    // The jump this replaces: the DELETE committed, the list re-read, and the
    // rows below closed the gap in the same frame. The row now stays in the
    // data until the slide and collapse have finished, so nothing underneath
    // moves until there is a gap to move into.
    mocks.holdTimings = true;
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    await setBookmark(userClient, 1, 1, true);

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-2-255');

    fireEvent.click(screen.getByTestId('bookmark-delete-2-255'));

    // Written already -- the row is only still drawn because its exit is
    // mid-flight, not because the delete has not happened.
    await waitFor(async () => expect(await getBookmarks(userClient)).toHaveLength(1));
    expect(rowIds()).toEqual(['bookmark-row-1-1', 'bookmark-row-2-255']);

    // Slide, then collapse, then the re-read.
    await act(async () => {
      while (mocks.heldTimings.length > 0) mocks.heldTimings.shift()?.(true);
    });

    await waitFor(() => expect(rowIds()).toEqual(['bookmark-row-1-1']));
  });

  it('asks before deleting a bookmark whose note would go with it', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    await setBookmarkNote(userClient, 2, 255, 'throne');

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-2-255');

    fireEvent.click(screen.getByTestId('bookmark-delete-2-255'));

    // The sheet is up and nothing has been written yet -- the half that makes
    // this a confirmation rather than a notification.
    expect(screen.getByText('Delete this bookmark?')).toBeTruthy();
    expect(rowIds()).toEqual(['bookmark-row-2-255']);
    expect(await getBookmarks(userClient)).toHaveLength(1);

    fireEvent.click(screen.getByTestId('confirm-accept'));

    await waitFor(() => expect(rowIds()).toEqual([]));
    expect(await getBookmarks(userClient)).toHaveLength(0);
  });

  it('keeps the bookmark and its note when the confirmation is cancelled', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    await setBookmarkNote(userClient, 2, 255, 'throne');

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-2-255');
    fireEvent.click(screen.getByTestId('bookmark-delete-2-255'));

    fireEvent.click(screen.getByTestId('confirm-cancel'));

    expect(screen.queryByText('Delete this bookmark?')).toBeNull();
    expect(rowIds()).toEqual(['bookmark-row-2-255']);
    expect(screen.getByText('throne')).toBeTruthy();
  });

  it('leaves the row in place and says so when the delete write fails', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-2-255');

    mocks.openUserDb = async () => {
      throw new Error('database is locked');
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    fireEvent.click(screen.getByTestId('bookmark-delete-2-255'));

    await screen.findByTestId('bookmark-delete-error');
    // Still there: a list that dropped the row optimistically would show a
    // bookmark as deleted that is still in the database.
    expect(rowIds()).toEqual(['bookmark-row-2-255']);
    logged.mockRestore();
  });

  it('does not carry a previous failure into the next bookmark\'s confirmation', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 1, 1, true);
    await setBookmark(userClient, 2, 255, true);
    await setBookmarkNote(userClient, 2, 255, 'throne');

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-2-255');

    const working = mocks.openUserDb;
    mocks.openUserDb = async () => {
      throw new Error('database is locked');
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    // The un-noted row deletes with no confirmation, so this failure lands on
    // the list itself.
    fireEvent.click(screen.getByTestId('bookmark-delete-1-1'));
    await screen.findByTestId('bookmark-delete-error');
    mocks.openUserDb = working;

    // A different row, a different write. The sheet must not open already
    // reporting a failure that belongs to the row above it.
    fireEvent.click(screen.getByTestId('bookmark-delete-2-255'));

    await screen.findByText('Delete this bookmark?');
    expect(screen.queryByTestId('confirm-error')).toBeNull();
    expect(screen.queryByTestId('bookmark-delete-error')).toBeNull();
    logged.mockRestore();
  });

  it('keeps the confirmation open, with the reason inside it, when that write fails', async () => {
    // The sheet is a <Modal> -- its own native window. A sheet that closed on
    // failure would drop the user back to a list still showing the bookmark
    // with nothing to say why, and an alert left on the list behind an open
    // sheet is drawn under it and announced to nobody.
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    await setBookmarkNote(userClient, 2, 255, 'throne');

    render(<BookmarksTab />);
    await screen.findByTestId('bookmark-row-2-255');
    fireEvent.click(screen.getByTestId('bookmark-delete-2-255'));

    mocks.openUserDb = async () => {
      throw new Error('database is locked');
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    fireEvent.click(screen.getByTestId('confirm-accept'));

    await screen.findByTestId('confirm-error');
    expect(screen.getByText('Delete this bookmark?')).toBeTruthy();
    expect(rowIds()).toEqual(['bookmark-row-2-255']);
    logged.mockRestore();
  });

  it('keeps the bookmark when a note is cleared', async () => {
    const userClient = requireUserClient();
    await setBookmark(userClient, 2, 255, true);
    await setBookmarkNote(userClient, 2, 255, 'throne');

    render(<BookmarksTab />);
    fireEvent.click(await screen.findByLabelText('Edit note'));
    fireEvent.change(screen.getByTestId('note-input'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Save'));

    await waitFor(() => expect(screen.queryByText('throne')).toBeNull());
    // The bookmark itself survives -- clearing a note is not deleting a row.
    expect(rowIds()).toEqual(['bookmark-row-2-255']);
  });
});

function requireUserClient() {
  if (!mocks.userClient) throw new Error('Bookmarks test user client was not initialized');
  return mocks.userClient;
}
