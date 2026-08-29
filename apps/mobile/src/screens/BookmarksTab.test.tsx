import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryUserClient } from '../data/userRepository.testHelpers';
import { setBookmark, setBookmarkNote } from '../data/userRepository';
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
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        mocks.focusCallbacks.push(callback);
        return callback();
      }, [callback]);
    },
  };
});

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
    withTiming: (to: unknown) => to,
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

    await waitFor(() => expect(screen.getByLabelText('Open 2:255')).toBeTruthy());
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
    const everythingLogged = logged.mock.calls.map((call) => JSON.stringify(call)).join(' ');
    expect(everythingLogged).not.toContain(secret);
    // ...but the coordinate IS logged, or the line is useless for debugging.
    expect(everythingLogged).toContain('255');
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
