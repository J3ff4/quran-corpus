import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryUserClient } from '../data/userRepository.testHelpers';
import { recordReadingPosition } from '../data/userRepository';
import HomeTab from '../../app/(tabs)/index';

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

describe('HomeTab', () => {
  beforeEach(() => {
    mocks.userClient = createMemoryUserClient();
    mocks.focusCallbacks = [];
  });

  it('shows the persisted reading position and refreshes it on focus', async () => {
    const userClient = requireUserClient();
    render(<HomeTab />);

    // Nothing read yet: the empty state is real, not the hardcoded string it
    // used to be regardless of history.
    await screen.findByText('No reading history yet');

    await recordReadingPosition(userClient, 2, 255);
    await act(async () => {
      mocks.focusCallbacks.at(-1)?.();
    });

    await waitFor(() => expect(screen.getByText('2:255')).toBeTruthy());
    expect(screen.queryByText('No reading history yet')).toBeNull();
  });

  it('surfaces a read failure instead of reporting an empty history', async () => {
    mocks.userClient = {
      execute: () => Promise.reject(new Error('user db is locked')),
    } as unknown as ReturnType<typeof createMemoryUserClient>;

    render(<HomeTab />);

    await waitFor(() => expect(screen.getByText('Unable to load reading history')).toBeTruthy());
    expect(screen.queryByText('No reading history yet')).toBeNull();
  });
});

function requireUserClient() {
  if (!mocks.userClient) throw new Error('Home test user client was not initialized');
  return mocks.userClient;
}
