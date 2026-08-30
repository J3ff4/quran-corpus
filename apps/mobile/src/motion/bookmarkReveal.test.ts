import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinearTransition, ZoomIn, ZoomOut } from 'react-native-reanimated';
import {
  PULSE_SCALE,
  noteReveal,
  shouldPulse,
  useBookmarkPulse,
} from './bookmarkReveal';

const sequences: unknown[][] = [];

// Identity builders, as in entryPager.test.ts: "the pen zooms in" is exactly
// "entering is ZoomIn", and the real `.duration()` returns a fresh instance, so
// the chain here returns the object it was called on.
vi.mock('react-native-reanimated', () => {
  const builder = (name: string) => {
    const self = {
      name,
      duration: (ms: number) => ({ ...self, ms }),
      easing: () => ({ ...self }),
    };
    return self;
  };
  return {
    default: { View: 'View' },
    ZoomIn: builder('ZoomIn'),
    ZoomOut: builder('ZoomOut'),
    LinearTransition: builder('LinearTransition'),
    Easing: { out: (fn: unknown) => fn, ease: 'ease' },
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (toValue: number) => toValue,
    // Recorded, not resolved: the pulse is a sequence and the test that
    // matters is whether one was STARTED, on which render.
    withSequence: (...steps: unknown[]) => {
      sequences.push(steps);
      return steps[steps.length - 1];
    },
  };
});
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: () => undefined }),
  },
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ reduceMotion: false }) }));

/** The builders record what they were configured with, so a test can name the
 *  animation without the duration getting in the way. */
function named(animation: unknown): { name?: string } {
  return (animation ?? {}) as { name?: string };
}

describe('noteReveal', () => {
  it('zooms the pen in, zooms it out, and glides the row between the two', () => {
    const reveal = noteReveal(false);

    expect(named(reveal.entering).name).toBe(ZoomIn.name);
    expect(named(reveal.exiting).name).toBe(ZoomOut.name);
    // The layout transition is what carries the bookmark left; without it the
    // pen appears in a gap that opened in a single frame.
    expect(named(reveal.layout).name).toBe(LinearTransition.name);
  });

  it('hands back nothing at all under reduced motion', () => {
    // §8. Undefined rather than a zero-duration builder: reanimated still runs
    // a zero-duration layout animation, and on Android that is its own frame
    // of jitter inside a FlatList.
    const reveal = noteReveal(true);

    expect(reveal.entering).toBeUndefined();
    expect(reveal.exiting).toBeUndefined();
    expect(reveal.layout).toBeUndefined();
  });
});

describe('shouldPulse', () => {
  it('fires on the tap that bookmarks the ayah', () => {
    expect(shouldPulse(true, false, false)).toBe(true);
  });

  it('does not fire on a re-render of an already-bookmarked ayah', () => {
    // The reader re-renders a card on every words fetch and every audio state
    // change. Without the edge check the glyph pulses at each of them.
    expect(shouldPulse(true, true, false)).toBe(false);
  });

  it('does not fire on un-bookmark', () => {
    // The pen leaving is that tap's feedback; a swell on the way out reads as
    // the control having been added, not removed.
    expect(shouldPulse(false, true, false)).toBe(false);
  });

  it('does not fire under reduced motion', () => {
    expect(shouldPulse(true, false, true)).toBe(false);
  });

  it('swells rather than shrinks', () => {
    // A "pulse" below 1 reads as the press squeeze, not as confirmation, and
    // a PULSE_SCALE of exactly 1 would leave every case above passing while
    // nothing moves.
    expect(PULSE_SCALE).toBeGreaterThan(1);
  });
});

describe('useBookmarkPulse', () => {
  beforeEach(() => {
    sequences.length = 0;
  });

  it('starts no pulse for an ayah that is already bookmarked when it mounts', () => {
    // Scrolling a bookmarked ayah into view is not a tap on it.
    renderHook(() => useBookmarkPulse(true));

    expect(sequences).toHaveLength(0);
  });

  it('starts one pulse when the ayah becomes bookmarked, and swells before it settles', () => {
    const { rerender } = renderHook(({ bookmarked }) => useBookmarkPulse(bookmarked), {
      initialProps: { bookmarked: false },
    });
    expect(sequences).toHaveLength(0);

    rerender({ bookmarked: true });

    expect(sequences).toHaveLength(1);
    // Out and back, in that order: a sequence that settles first and swells
    // afterwards leaves the glyph enlarged.
    expect(sequences[0]).toEqual([PULSE_SCALE, 1]);
  });

  it('starts no pulse when the ayah is un-bookmarked again', () => {
    const { rerender } = renderHook(({ bookmarked }) => useBookmarkPulse(bookmarked), {
      initialProps: { bookmarked: false },
    });
    rerender({ bookmarked: true });
    sequences.length = 0;

    rerender({ bookmarked: false });

    expect(sequences).toHaveLength(0);
  });
});
