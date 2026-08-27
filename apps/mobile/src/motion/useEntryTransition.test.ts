import { describe, expect, it, vi } from 'vitest';
import { enterOffset } from './useEntryTransition';

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
