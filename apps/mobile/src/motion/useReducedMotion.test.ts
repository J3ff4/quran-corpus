import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Static, not a top-level `await import`: vi.mock is hoisted above the imports
// either way, and the await form is a syntax error under the CommonJS
// tsconfig.test.json program even though vitest runs it happily.
import { useReducedMotion } from './useReducedMotion';

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
    remove.mockClear();
    isReduceMotionEnabled.mockClear();
    isReduceMotionEnabled.mockResolvedValue(true);
    mocks.settings = { reduceMotion: false };
  });

  it('reports the system setting once it resolves', async () => {
    const { result } = renderHook(() => useReducedMotion());

    // Starts false: isReduceMotionEnabled is async, and defaulting to `true`
    // would make every animation skip its first frame on every launch.
    expect(result.current).toBe(false);
    await act(async () => {});
    expect(result.current).toBe(true);
  });

  it('follows a change made while the app is running', async () => {
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

    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});

    expect(result.current).toBe(true);
  });

  it('keeps the system flag even when the app setting is off', async () => {
    // OR, not override. A user who asked the OS for no animations must not
    // lose that because an in-app switch defaults off.
    isReduceMotionEnabled.mockResolvedValue(true);
    mocks.settings.reduceMotion = false;

    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});

    expect(result.current).toBe(true);
  });

  it('animates when neither source asks for reduced motion', async () => {
    isReduceMotionEnabled.mockResolvedValue(false);

    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});

    expect(result.current).toBe(false);
  });

  it('removes its listener on unmount', async () => {
    const { unmount } = renderHook(() => useReducedMotion());
    await act(async () => {});

    unmount();

    expect(remove).toHaveBeenCalled();
  });
});
