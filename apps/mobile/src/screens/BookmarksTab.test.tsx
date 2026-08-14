import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryUserClient } from '../data/userRepository.testHelpers';
import { setBookmark } from '../data/userRepository';
import BookmarksTab from '../../app/(tabs)/bookmarks';

const mocks = vi.hoisted(() => ({
  userClient: null as ReturnType<typeof createMemoryUserClient> | null,
  openUserDb: null as (() => Promise<ReturnType<typeof createMemoryUserClient> | null>) | null,
  focusCallbacks: [] as Array<() => void | (() => void)>,
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

// One factory only: `@/data/userDb` and `../data/userDb` resolve to the same
// module, so a second vi.mock for the relative form is dead weight.
vi.mock('@/data/userDb', () => ({
  openUserDb: async () => (mocks.openUserDb ? mocks.openUserDb() : mocks.userClient),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en' }),
}));

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ children }: { children?: React.ReactNode }) => React.createElement('a', null, children),
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        mocks.focusCallbacks.push(callback);
        return callback();
      }, [callback]);
    },
  };
});

vi.mock('react-native', async () => {
  const React = await import('react');
  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
    View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  };
});

describe('BookmarksTab', () => {
  beforeEach(() => {
    mocks.userClient = createMemoryUserClient();
    mocks.openUserDb = null;
    mocks.focusCallbacks = [];
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

    await waitFor(() => expect(screen.getByText('Open 2:255')).toBeTruthy());
  });

  it('renders the failure and clears the spinner when the user DB cannot open', async () => {
    mocks.openUserDb = async () => {
      throw new Error('database is locked');
    };

    render(<BookmarksTab />);

    await screen.findByText('database is locked');
    // Both halves matter: a regression that leaves the spinner up forever, or
    // one that renders the error alongside the empty state, would otherwise
    // ship silently.
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.queryByText('No bookmarks yet')).toBeNull();
  });
});

function requireUserClient() {
  if (!mocks.userClient) throw new Error('Bookmarks test user client was not initialized');
  return mocks.userClient;
}
