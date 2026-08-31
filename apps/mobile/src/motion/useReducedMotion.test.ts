import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The hook, from a module that has not been used yet.
 *
 *  The read and the listener are now module state shared by every caller --
 *  that is the whole point of it -- so a suite that imported it once would
 *  carry one test's resolved value and live subscribers into the next. Each
 *  test gets its own copy instead. Imported inside a test body rather than at
 *  the top: a top-level `await import` is a syntax error under the CommonJS
 *  tsconfig.test.json program, even though vitest runs it happily.
 */
async function freshHook() {
  vi.resetModules();
  const module = await import('./useReducedMotion');
  return module.useReducedMotion;
}

const listeners: Record<string, (value: boolean) => void> = {};
const remove = vi.fn();
const isReduceMotionEnabled = vi.fn(async () => true);

const mocks = vi.hoisted(() => ({
  settings: { reduceMotion: false },
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => mocks.settings,
}));

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => isReduceMotionEnabled(),
    addEventListener: (event: string, handler: (value: boolean) => void) => {
      listeners[event] = handler;
      return { remove };
    },
  },
}));

describe('useReducedMotion', () => {
  beforeEach(() => {
    for (const key of Object.keys(listeners)) delete listeners[key];
    remove.mockClear();
    isReduceMotionEnabled.mockClear();
    isReduceMotionEnabled.mockResolvedValue(true);
    mocks.settings = { reduceMotion: false };
  });

  it('costs one native read and one subscription no matter how many callers', async () => {
    const useReducedMotion = await freshHook();
    // Every browse row calls usePressScale, which calls this. A per-caller
    // subscription means a screenful of rows fires a screenful of async
    // AccessibilityInfo reads and then re-renders each row when its own read
    // resolves -- all of it on the JS thread, during the commit that mounts
    // the list. That is what makes a tab switch stutter on Surahs and
    // Dictionary and not on Bookmarks, whose rows do not use it.
    const rows = Array.from({ length: 30 }, () => renderHook(() => useReducedMotion()));
    await act(async () => {
      await Promise.resolve();
    });

    expect(isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    expect(Object.keys(listeners)).toHaveLength(1);
    // And every caller still gets the answer.
    expect(rows.every((row) => row.result.current === true)).toBe(true);

  });

  it('reports the system setting once it resolves', async () => {
    const useReducedMotion = await freshHook();
    const { result } = renderHook(() => useReducedMotion());

    // Starts false: isReduceMotionEnabled is async, and defaulting to `true`
    // would make every animation skip its first frame on every launch.
    expect(result.current).toBe(false);
    await act(async () => {});
    expect(result.current).toBe(true);
  });

  it('follows a change made while the app is running', async () => {
    const useReducedMotion = await freshHook();
    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});

    await act(async () => listeners['reduceMotionChanged']?.(false));

    // Android lets the setting change without restarting the app. Reading it
    // only at mount leaves the sheet animating for a user who just turned
    // animation off.
    expect(result.current).toBe(false);
  });

  it('reduces motion when the app setting is on and the system flag is off', async () => {
    // The owner's device exposes no OS toggle at the documented path, so the
    // app needs its own way to reach this state (device report, 2026-08-16).
    isReduceMotionEnabled.mockResolvedValue(false);
    mocks.settings.reduceMotion = true;
    const useReducedMotion = await freshHook();

    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});

    expect(result.current).toBe(true);
  });

  it('keeps the system flag even when the app setting is off', async () => {
    // OR, not override. A user who asked the OS for no animations must not
    // lose that because an in-app switch defaults off.
    isReduceMotionEnabled.mockResolvedValue(true);
    mocks.settings.reduceMotion = false;
    const useReducedMotion = await freshHook();

    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});

    expect(result.current).toBe(true);
  });

  it('animates when neither source asks for reduced motion', async () => {
    isReduceMotionEnabled.mockResolvedValue(false);
    const useReducedMotion = await freshHook();

    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});

    expect(result.current).toBe(false);
  });

  it('survives a screen change without re-reading anything', async () => {
    // A tab switch unmounts the old list's rows BEFORE the new list's mount,
    // so a refcounted subscription passes through zero on every switch: the
    // listener goes, the next row pays for a fresh async read, and its resolve
    // wakes every subscriber in the app. That was a stutter on each switch.
    const useReducedMotion = await freshHook();
    const first = renderHook(() => useReducedMotion());
    await act(async () => {});
    expect(isReduceMotionEnabled).toHaveBeenCalledTimes(1);

    first.unmount();
    const second = renderHook(() => useReducedMotion());
    await act(async () => {});

    // Still one read, still one listener, and the new caller already knows.
    expect(isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(second.result.current).toBe(true);
  });
});
