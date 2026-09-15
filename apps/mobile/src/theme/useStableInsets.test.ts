import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted, because the mock factory below runs during the static import of the
// hook -- which is itself hoisted above this line. A plain const would be in
// its temporal dead zone by then. (A top-level `await import` dodged that and
// type-checked red under tsconfig.test.json's node16 resolution.)
const insets = vi.hoisted(() => ({ value: { top: 28, bottom: 48, left: 0, right: 0 } }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => insets.value,
}));

import { useStableInsets } from './useStableInsets';

beforeEach(() => {
  insets.value = { top: 28, bottom: 48, left: 0, right: 0 };
});

describe('useStableInsets', () => {
  it('reports the live insets while the system bars are up', () => {
    const { result } = renderHook(() => useStableInsets());
    expect(result.current).toEqual({ top: 28, bottom: 48, left: 0, right: 0 });
  });

  it('holds the last non-zero inset once a bar hides', () => {
    const { result, rerender } = renderHook(() => useStableInsets());
    insets.value = { top: 0, bottom: 0, left: 0, right: 0 };
    rerender();
    // The whole point: the page must not move when the chrome leaves.
    expect(result.current.top).toBe(28);
    expect(result.current.bottom).toBe(48);
  });

  it('follows a real inset change rather than pinning the first one', () => {
    const { result, rerender } = renderHook(() => useStableInsets());
    insets.value = { top: 44, bottom: 34, left: 0, right: 0 };
    rerender();
    expect(result.current).toEqual({ top: 44, bottom: 34, left: 0, right: 0 });
  });

  it('keeps the same object when nothing changed, so dependency lists stay quiet', () => {
    const { result, rerender } = renderHook(() => useStableInsets());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
