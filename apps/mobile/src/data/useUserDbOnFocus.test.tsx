import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '../testing/deferred';
import { useUserDbOnFocus } from './useUserDbOnFocus';

const mocks = vi.hoisted(() => ({
  openUserDb: null as (() => Promise<unknown>) | null,
  focusCallbacks: [] as Array<() => void | (() => void)>,
  blur: null as (() => void) | null,
  appStateListeners: [] as Array<(state: string) => void>,
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('./userDb', () => ({
  openUserDb: async () => (mocks.openUserDb ? mocks.openUserDb() : {}),
}));

// Only AppState is reached from this module, and the real one needs a native
// bridge jsdom has no counterpart for. Listeners are kept so a test can drive
// a resume, and the remove() is observable so the unsubscribe can be asserted.
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.appStateListeners.push(listener);
      return {
        remove: () => {
          mocks.appStateListeners = mocks.appStateListeners.filter((entry) => entry !== listener);
        },
      };
    },
  },
}));

// The real useFocusEffect runs the callback on focus and its returned teardown
// on blur. Keeping the callback around lets a test re-run it, which is the only
// way to reach the refocus path.
vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        mocks.focusCallbacks.push(callback);
        const teardown = callback();
        mocks.blur = typeof teardown === 'function' ? teardown : null;
        return teardown;
      }, [callback]);
    },
  };
});

function Probe({ load }: { load: (client: unknown) => Promise<string> }) {
  const { data, loading, error } = useUserDbOnFocus(load, 'Unable to load');
  return (
    <div>
      <span>{loading ? 'loading' : 'idle'}</span>
      <span>{data ?? 'no-data'}</span>
      <span>{error ?? 'no-error'}</span>
    </div>
  );
}

describe('useUserDbOnFocus', () => {
  beforeEach(() => {
    mocks.openUserDb = null;
    mocks.focusCallbacks = [];
    mocks.blur = null;
    mocks.appStateListeners = [];
  });

  afterEach(cleanup);

  it('loads on focus and clears the spinner', async () => {
    render(<Probe load={async () => 'first'} />);

    await screen.findByText('first');
    expect(screen.getByText('idle')).toBeTruthy();
    expect(screen.getByText('no-error')).toBeTruthy();
  });

  it('reloads when the screen regains focus', async () => {
    let reads = 0;
    render(<Probe load={async () => `read-${++reads}`} />);

    await screen.findByText('read-1');

    await act(async () => {
      mocks.focusCallbacks.at(-1)?.();
    });

    // The reader writes as you scroll, so a tab that only read on mount would
    // show whatever was true the last time it mounted.
    await waitFor(() => expect(screen.getByText('read-2')).toBeTruthy());
  });

  it('reloads when the app is resumed on a screen that never lost focus', async () => {
    let reads = 0;
    render(<Probe load={async () => `read-${++reads}`} />);

    await screen.findByText('read-1');

    await act(async () => {
      for (const listener of mocks.appStateListeners) listener('active');
    });

    // Focus does not fire again for the tab you were already on, and Home is
    // the launch screen. Without this it shows the counters it read on the way
    // in -- across a day boundary, yesterday's streak.
    await waitFor(() => expect(screen.getByText('read-2')).toBeTruthy());
  });

  it('ignores a resume that is not a return to the foreground', async () => {
    let reads = 0;
    render(<Probe load={async () => `read-${++reads}`} />);

    await screen.findByText('read-1');

    await act(async () => {
      for (const listener of mocks.appStateListeners) listener('background');
    });

    // 'change' fires on the way out too. Re-reading there costs a DB open per
    // blurred screen and lands on a screen nobody is looking at.
    expect(screen.getByText('read-1')).toBeTruthy();
  });

  it('stops listening for resumes once the screen blurs', async () => {
    render(<Probe load={async () => 'first'} />);
    await screen.findByText('first');

    // Asserted before as well as after: without this the test also passes when
    // the hook never subscribes at all.
    expect(mocks.appStateListeners).toHaveLength(1);

    act(() => {
      mocks.blur?.();
    });

    // Left subscribed, every screen ever focused re-reads the user DB on every
    // resume, and each one setStates into a blurred tree.
    expect(mocks.appStateListeners).toHaveLength(0);
  });

  it('keeps the newest read when a resume overtakes the focus read', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loads = [() => first.promise, () => second.promise];
    render(<Probe load={() => (loads.shift() ?? (() => second.promise))()} />);

    await screen.findByText('loading');
    act(() => {
      for (const listener of mocks.appStateListeners) listener('active');
    });

    // The resume's read settles first, then the focus read that started
    // earlier. Order of arrival is not order of issue, and the older one must
    // not win: that would paint pre-resume numbers and leave them there.
    await act(async () => {
      second.resolve('resume');
    });
    await act(async () => {
      first.resolve('stale');
    });

    expect(screen.getByText('resume')).toBeTruthy();
    expect(screen.queryByText('stale')).toBeNull();
  });

  it('shows the localized fallback rather than the driver message', async () => {
    mocks.openUserDb = () => Promise.reject(new Error('database is locked'));

    render(<Probe load={async () => 'never'} />);

    await screen.findByText('Unable to load');
    // Untranslated internal English on a Uzbek or Russian screen, and it can
    // carry a path off the device.
    expect(screen.queryByText('database is locked')).toBeNull();
    expect(screen.getByText('idle')).toBeTruthy();
  });

  it('does not set state for a load that resolves after blur', async () => {
    const pending = deferred<string>();

    render(<Probe load={() => pending.promise} />);
    await screen.findByText('loading');

    act(() => {
      mocks.blur?.();
    });
    await act(async () => {
      pending.resolve('too late');
    });

    // Still the pre-blur state: a setState here is the classic "update on an
    // unmounted/blurred screen" leak, and it would also stamp stale data over
    // whatever the next focus loaded.
    expect(screen.getByText('no-data')).toBeTruthy();
    expect(screen.getByText('loading')).toBeTruthy();
  });
});
