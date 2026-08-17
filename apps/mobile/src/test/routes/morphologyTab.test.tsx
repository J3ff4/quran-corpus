import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Not colocated with the route -- see word.test.tsx for why app/ cannot hold a
// test file.
import MorphologyTab from '../../../app/(tabs)/morphology';

interface Position {
  surahId: number;
  ayahNumber: number;
}

const mocks = vi.hoisted(() => ({
  position: null as Position | null,
  loading: false,
  error: null as string | null,
  redirect: vi.fn(),
  getWbwScreen: vi.fn(),
}));

// The hook has its own suite; stubbed here so this one covers the decision the
// tab makes -- render the word-by-word screen, the empty state, or the error --
// rather than re-testing the focus read underneath it.
vi.mock('@/data/useUserDbOnFocus', () => ({
  useUserDbOnFocus: () => ({ data: mocks.position, loading: mocks.loading, error: mocks.error }),
}));

vi.mock('@/data/userRepository', () => ({
  getLastReadingPosition: vi.fn(),
}));

// A stub, not the real screen: the real WbwScreen has its own suite (words.test.tsx)
// covering the DB load. Its call shape here mirrors corpusRepository's own
// getWbwScreen(client, surahId, from) so the assertion below reads the same as
// words.test.tsx's.
vi.mock('@/screens/WbwScreen', async () => {
  const React = await import('react');
  return {
    WbwScreen: (props: { surahId: number | null; from: number }) => {
      mocks.getWbwScreen(props, props.surahId, props.from);
      return React.createElement('div', { 'data-testid': 'wbw-screen' });
    },
  };
});

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Redirect: (props: { href: string }) => {
      mocks.redirect(props);
      return React.createElement('span', { 'data-testid': 'redirect' });
    },
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

describe('morphology tab', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.position = null;
    mocks.loading = false;
    mocks.error = null;
    mocks.redirect.mockReset();
    mocks.getWbwScreen.mockReset();
  });

  it('renders the word-by-word screen inside the tab, not a redirect away from it', async () => {
    // A <Redirect> here left the tab bar behind and pushed nothing, so Android
    // back exited the app -- owner device report, 2026-08-16.
    mocks.position = { surahId: 2, ayahNumber: 21 };

    render(<MorphologyTab />);

    expect(await screen.findByTestId('wbw-screen')).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('opens at the last-read ayah', async () => {
    mocks.position = { surahId: 2, ayahNumber: 21 };

    render(<MorphologyTab />);

    await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenCalledWith(expect.anything(), 2, 21));
  });

  it('still shows the empty state with no reading history', async () => {
    mocks.position = null;

    render(<MorphologyTab />);

    expect(await screen.findByText('No reading history yet')).toBeTruthy();
    expect(mocks.getWbwScreen).not.toHaveBeenCalled();
  });

  it('does not claim an empty history while the read is still in flight', () => {
    // `data` is null until the read settles, so the empty state has to wait for
    // it. Otherwise every open of the tab flashes "no reading history" at a
    // reader who has one, and then jumps.
    mocks.position = null;
    mocks.loading = true;

    render(<MorphologyTab />);

    expect(screen.getByTestId('loading')).toBeTruthy();
    expect(screen.queryByText(/no reading history/i)).toBeNull();
    expect(screen.queryByTestId('wbw-screen')).toBeNull();
  });

  it('shows the read failure rather than a false empty state', () => {
    mocks.position = null;
    mocks.error = 'Unable to load reading history';

    render(<MorphologyTab />);

    expect(screen.getByRole('alert').textContent).toBe('Unable to load reading history');
    expect(screen.queryByText(/no reading history/i)).toBeNull();
  });
});
