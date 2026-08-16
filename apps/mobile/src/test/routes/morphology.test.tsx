import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserDbLoadState } from '@/data/useUserDbOnFocus';
// Not colocated with the route -- see word.test.tsx for why app/ cannot hold a
// test file.
import MorphologyTab from '../../../app/(tabs)/morphology';

interface Position {
  surahId: number;
  ayahNumber: number;
}

const mocks = vi.hoisted(() => ({
  state: { data: null, loading: false, error: null } as UserDbLoadState<unknown>,
}));

// The hook has its own suite; stubbed here so this one covers the decision the
// tab makes -- redirect, empty state, or error -- rather than re-testing the
// focus read underneath it.
vi.mock('@/data/useUserDbOnFocus', () => ({
  useUserDbOnFocus: () => mocks.state,
}));

vi.mock('@/data/userRepository', () => ({
  getLastReadingPosition: vi.fn(),
}));

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement('span', { 'data-testid': 'redirect', 'data-href': href }),
    Link: ({ href, children }: { href: string; children?: React.ReactNode }) =>
      React.createElement('a', { href, 'data-testid': 'link' }, children),
  };
});

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ contentLanguage: 'en', uiLocale: 'en' }),
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');

  return {
    ActivityIndicator: () => React.createElement('span', { 'data-testid': 'loading' }),
    Text: host('span'),
    View: host('div'),
  };
});

function renderTab(position: Position | null, overrides: Partial<UserDbLoadState<unknown>> = {}) {
  mocks.state = { data: position, loading: false, error: null, ...overrides };
  render(<MorphologyTab />);
}

describe('morphology tab', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.state = { data: null, loading: false, error: null };
  });

  it('sends a reader with history straight to their surah', async () => {
    renderTab({ surahId: 2, ayahNumber: 255 });

    // Carrying the ayah is the whole point: without it the tab opens every
    // surah at ayah 1, which for al-Baqarah is 254 pages away from where the
    // reader stopped.
    expect((await screen.findByTestId('redirect')).getAttribute('data-href')).toBe(
      '/surah/2/words?from=255',
    );
  });

  it('offers the surah list when there is no history', async () => {
    // The tab is reachable on a fresh install, before anything has been read.
    renderTab(null);

    expect(await screen.findByText(/no reading history/i)).toBeTruthy();
    expect(screen.getByTestId('link').getAttribute('href')).toBe('/surahs');
  });

  it('does not claim an empty history while the read is still in flight', () => {
    // `data` is null until the read settles, so the empty state has to wait for
    // it. Otherwise every open of the tab flashes "no reading history" at a
    // reader who has one, and then jumps.
    renderTab(null, { loading: true });

    expect(screen.getByTestId('loading')).toBeTruthy();
    expect(screen.queryByText(/no reading history/i)).toBeNull();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('shows the read failure rather than a false empty state', () => {
    renderTab(null, { error: 'Unable to load reading history' });

    expect(screen.getByRole('alert').textContent).toBe('Unable to load reading history');
    expect(screen.queryByText(/no reading history/i)).toBeNull();
  });
});
