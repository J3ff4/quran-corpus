import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryUserClient } from '../data/userRepository.testHelpers';
import { setBookmark } from '../data/userRepository';
import BookmarksTab from '../../app/(tabs)/bookmarks';

const mocks = vi.hoisted(() => ({
  userClient: null as ReturnType<typeof createMemoryUserClient> | null,
  focusCallbacks: [] as Array<() => void | (() => void)>,
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('../data/userDb', () => ({
  openUserDb: async () => mocks.userClient,
}));

vi.mock('@/data/userDb', () => ({
  openUserDb: async () => mocks.userClient,
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
    mocks.focusCallbacks = [];
  });

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
});

function requireUserClient() {
  if (!mocks.userClient) throw new Error('Bookmarks test user client was not initialized');
  return mocks.userClient;
}
