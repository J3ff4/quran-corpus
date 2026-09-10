import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHROME_IDLE_MS,
  hideChrome,
  releaseChrome,
  showChrome,
  toggleChrome,
  useChromeVisible,
} from './chromeVisibility';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => releaseChrome());
  vi.useRealTimers();
});

describe('chrome visibility', () => {
  it('starts visible, so every other screen-s tab bar is untouched', () => {
    const { result } = renderHook(() => useChromeVisible());
    expect(result.current).toBe(true);
  });

  it('hides itself after the idle window and not before', () => {
    const { result } = renderHook(() => useChromeVisible());
    act(() => showChrome());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 1));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('restarts the countdown on every interaction', () => {
    const { result } = renderHook(() => useChromeVisible());
    act(() => showChrome());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 100));
    act(() => showChrome());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 100));
    // Would already be hidden if the second show had not cleared the first
    // timer -- the bug this asserts against is a stale timeout firing over a
    // chrome the user has just asked for.
    expect(result.current).toBe(true);
  });

  it('toggles both ways, and hides at once', () => {
    const { result } = renderHook(() => useChromeVisible());
    act(() => toggleChrome());
    expect(result.current).toBe(false);
    act(() => toggleChrome());
    expect(result.current).toBe(true);
    act(() => hideChrome());
    expect(result.current).toBe(false);
  });

  it('does not fire a pending timer over a chrome that was released', () => {
    const { result } = renderHook(() => useChromeVisible());
    act(() => showChrome());
    act(() => releaseChrome());
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS * 2));
    // Leaving the mushaf while the countdown is running must not hide the tab
    // bar on whatever screen the user landed on.
    expect(result.current).toBe(true);
  });
});
