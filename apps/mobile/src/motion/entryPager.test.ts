import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FadeIn,
  FadeOut,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from 'react-native-reanimated';
import { PAGE_MS, pagerAnimation, useEntryPager, useHeldEntry } from './entryPager';

// Identity is what these assertions turn on -- "Next brought the incoming
// entry in from the right" is exactly "entering is SlideInRight" -- and the
// real builders' `.duration()` returns a fresh instance, so the chain here
// returns the same object it was called on.
vi.mock('react-native-reanimated', () => {
  const builder = (name: string) => {
    const self = { name, duration: (ms: number) => ({ ...self, ms }) };
    return self;
  };
  return {
    default: { View: 'View' },
    FadeIn: builder('FadeIn'),
    FadeOut: builder('FadeOut'),
    SlideInLeft: builder('SlideInLeft'),
    SlideInRight: builder('SlideInRight'),
    SlideOutLeft: builder('SlideOutLeft'),
    SlideOutRight: builder('SlideOutRight'),
  };
});
// pagerAnimation is pure, but ESM still evaluates the module it lives in,
// which reaches useReducedMotion and so react-native -- the same reason
// usePressScale.test.ts mocks it.
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: () => undefined }),
  },
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ reduceMotion: false }) }));


/** The builders record what they were configured with, so a test can name the
 *  animation without the duration getting in the way. */
function named(animation: unknown): { name?: string; ms?: number } {
  return (animation ?? {}) as { name?: string; ms?: number };
}

describe('pagerAnimation', () => {
  it('slides the incoming entry in from the right and the outgoing one off left on Next', () => {
    // Owner ruling, 2026-08-27: a true pager, so both halves move. The
    // directions are the whole ruling -- a pager that travels the wrong way
    // reads as the reader having pressed the other button.
    const { entering, exiting } = pagerAnimation('next', false);
    expect(named(entering).name).toBe(SlideInRight.name);
    expect(named(exiting).name).toBe(SlideOutLeft.name);
  });

  it('mirrors both halves on Previous', () => {
    const { entering, exiting } = pagerAnimation('prev', false);
    expect(named(entering).name).toBe(SlideInLeft.name);
    expect(named(exiting).name).toBe(SlideOutRight.name);
  });

  it('cross-fades instead of sliding under reduced motion', () => {
    // §8. A full-width slide of the whole screen is exactly the vestibular
    // trigger the setting exists for.
    expect(named(pagerAnimation('next', true).entering).name).toBe(FadeIn.name);
    expect(named(pagerAnimation('prev', true).exiting).name).toBe(FadeOut.name);
  });

  it('does not animate an entry that did not arrive from the pager', () => {
    // A deep link, a back, a tap on a concordance root. There is no direction
    // to honour, and inventing one animates arriving somewhere as though the
    // reader had paged there.
    expect(pagerAnimation(null, false)).toEqual({});
    expect(pagerAnimation(null, true)).toEqual({});
  });

  it('runs both halves over the same duration, so they travel together', () => {
    const { entering, exiting } = pagerAnimation('next', false);
    expect(named(entering).ms).toBe(PAGE_MS);
    expect(named(exiting).ms).toBe(PAGE_MS);
  });
});

describe('useEntryPager', () => {
  it('pages without navigating, and animates the direction pressed', () => {
    const { result } = renderHook(() => useEntryPager('qwl'));
    expect(result.current.current).toBe('qwl');
    // Nothing arrived from the pager yet.
    expect(result.current.animation).toEqual({});

    act(() => result.current.goTo('qwm', 'next'));

    expect(result.current.current).toBe('qwm');
    expect(named(result.current.animation.entering).name).toBe(SlideInRight.name);
  });

  it('drops the direction when the route itself changes underneath it', () => {
    // A deep link, or a concordance tap that pushed a different entry: it did
    // not come from the pager, so it must not inherit the last press.
    const { result, rerender } = renderHook(({ key }) => useEntryPager(key), {
      initialProps: { key: 'qwl' as string | null },
    });
    act(() => result.current.goTo('qwm', 'prev'));
    expect(named(result.current.animation.entering).name).toBe(SlideInLeft.name);

    rerender({ key: 'qyl' });

    expect(result.current.current).toBe('qyl');
    expect(result.current.animation).toEqual({});
  });
});

describe('useHeldEntry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the last loaded entry on screen while the next one loads', () => {
    // Blanking to a spinner here is what made paging read as "the entry
    // vanished, then something slid in" -- and it leaves reanimated nothing to
    // slide out.
    const { result, rerender } = renderHook(({ value }) => useHeldEntry(value), {
      initialProps: { value: 'qwl' as string | null },
    });
    expect(result.current).toBe('qwl');

    rerender({ value: null });
    expect(result.current).toBe('qwl');

    rerender({ value: 'qwm' });
    expect(result.current).toBe('qwm');
  });

  it('has nothing to hold before the first entry lands', () => {
    const { result } = renderHook(() => useHeldEntry<string>(null));
    expect(result.current).toBeNull();
  });
});
