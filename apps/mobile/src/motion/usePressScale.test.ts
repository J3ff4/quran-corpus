import { describe, expect, it, vi } from 'vitest';
import { PRESSED_SCALE, RESTING_SCALE, nextPressScale } from './usePressScale';

// nextPressScale is pure, but ESM still evaluates the module it lives in, which
// reaches useReducedMotion and so react-native. Without this the suite fails to
// collect on React Native's own Flow source rather than on anything here.
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: () => undefined }),
  },
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ reduceMotion: false }) }));

describe('nextPressScale', () => {
  it('shrinks on press and returns on release', () => {
    expect(nextPressScale('in', false)).toBe(PRESSED_SCALE);
    expect(nextPressScale('out', false)).toBe(RESTING_SCALE);
  });

  it('does not move at all when reduced motion is on', () => {
    // Not cosmetic: a scale transform on press is exactly the vestibular
    // trigger the setting exists for, and it is the one animation that fires on
    // literally every tap in the app.
    expect(nextPressScale('in', true)).toBe(RESTING_SCALE);
    expect(nextPressScale('out', true)).toBe(RESTING_SCALE);
  });

  it('presses to something smaller than rest', () => {
    // A 'squeeze' that grows the target reads as a bug, and both constants
    // being 1 would make the two cases above pass while nothing animates.
    expect(PRESSED_SCALE).toBeLessThan(RESTING_SCALE);
  });
});
