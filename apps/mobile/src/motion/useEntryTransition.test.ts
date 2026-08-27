import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTER_MS, enterOffset, useEntryTransition } from './useEntryTransition';

// Records what the hook asks the UI thread to do. The global reanimated mock
// in test/setup.ts resolves withTiming instantly and keeps no history, so a
// test could not otherwise tell "slid in from the right" from "did nothing".
const timings: { to: number; duration: number }[] = [];
// Every write, not the final value: the hook parks the entry off screen and
// then animates it back to 0 in the same tick, so the interesting number is
// gone by the time the test could read `.value`.
const writes: number[] = [];
vi.mock('react-native-reanimated', () => ({
  useSharedValue: (initial: number) => {
    let held = initial;
    return {
      get value() {
        return held;
      },
      set value(next: number) {
        held = next;
        writes.push(next);
      },
    };
  },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  withTiming: (to: number, config?: { duration?: number }) => {
    timings.push({ to, duration: config?.duration ?? 0 });
    return to;
  },
  Easing: { out: (fn: unknown) => fn, cubic: undefined },
}));

// enterOffset is pure, but ESM still evaluates the module it lives in, which
// reaches useReducedMotion and so react-native -- same reason
// usePressScale.test.ts mocks it.
vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: () => undefined }),
  },
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ reduceMotion: false }) }));

describe('enterOffset', () => {
  it('brings Next in from the right and Previous from the left', () => {
    // Owner ruling D4. The signs are the whole ruling: a pager that slides the
    // wrong way reads as the reader having pressed the other button.
    expect(enterOffset('next', false, 390)).toBe(390);
    expect(enterOffset('prev', false, 390)).toBe(-390);
  });

  it('does not slide at all under reduced motion', () => {
    // §8. A full-width slide of the whole screen is exactly the vestibular
    // trigger the setting exists for; the hook cross-fades instead.
    expect(enterOffset('next', true, 390)).toBe(0);
    expect(enterOffset('prev', true, 390)).toBe(0);
  });

  it('does not slide an entry that did not arrive from the pager', () => {
    // A deep link, a back, a tap on a root inside the concordance. There is no
    // direction to honour, and inventing one animates arriving somewhere as
    // though the reader had swiped there.
    expect(enterOffset(null, false, 390)).toBe(0);
  });

  it('slides the full width, not a fixed nudge', () => {
    // D4 says the whole screen moves, like a native pager. A constant would
    // read as a jiggle on a tablet and as a full slide on a phone.
    expect(enterOffset('next', false, 1024)).toBe(1024);
  });
});

describe('useEntryTransition across a remount', () => {
  beforeEach(() => {
    timings.length = 0;
    writes.length = 0;
  });

  it('slides the entry the pager asked for even though the screen remounts', () => {
    // expo-router remounts a [param] screen when `replace` changes the param,
    // so the instance that recorded the direction is gone before the instance
    // that has to animate ever renders. Traced on device 2026-08-27: the side
    // arrived as null and nothing moved at all. The two renders below are two
    // component instances, which is why markSide is called on the first and
    // asserted on the second.
    const first = renderHook(() => useEntryTransition('qwl'));
    first.result.current.markSide('next');
    first.unmount();

    renderHook(() => useEntryTransition('qwm'));

    // Positive: D4 brings Next in from the right, then travels back to rest.
    expect(writes).toContain(390);
    expect(timings).toContainEqual({ to: 0, duration: ENTER_MS });
  });

  it('holds the direction while the new entry is still loading', () => {
    // The screens key this on what is drawn, and nothing is drawn until three
    // queries land -- so the remounted screen renders null first and the real
    // key some frames later. Spending the side on that null frame animates a
    // spinner and leaves the entry itself to fade in with no direction, which
    // is what the device showed on the first attempt at this fix.
    const first = renderHook(() => useEntryTransition('qwl'));
    first.result.current.markSide('next');
    first.unmount();

    const remounted = renderHook(({ key }) => useEntryTransition(key), {
      initialProps: { key: null as string | null },
    });
    expect(writes).toEqual([]);

    remounted.rerender({ key: 'qwm' });
    expect(writes).toContain(390);
    expect(timings).toContainEqual({ to: 0, duration: ENTER_MS });
  });

  it('consumes the direction, so the next entry opened cold does not inherit it', () => {
    const first = renderHook(() => useEntryTransition('qwl'));
    first.result.current.markSide('prev');
    first.unmount();
    renderHook(() => useEntryTransition('qwm')).unmount();

    timings.length = 0;
    writes.length = 0;
    // A deep link, a back, a concordance tap: no direction to honour.
    renderHook(() => useEntryTransition('qyl'));
    expect(writes).toEqual([]);
    expect(timings).toEqual([]);
  });
});
