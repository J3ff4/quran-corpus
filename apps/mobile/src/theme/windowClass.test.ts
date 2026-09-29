import { describe, expect, it, vi } from 'vitest';

// windowClass.ts imports useWindowDimensions from 'react-native' at module
// scope for its hooks (useWindowClass/useColumns), which this file does not
// exercise -- but every RN-importing module needs 'react-native' mocked under
// this repo's vitest/jsdom setup regardless (see AyahMedallion.test.tsx),
// since the real package source does not parse here. The value is never read
// by the pure-function tests below.
vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: 0, height: 0, scale: 1, fontScale: 1 }),
}));

import { columnsFor, windowClassFor, CLASS_MEDIUM_MIN, CLASS_EXPANDED_MIN } from './windowClass';

describe('windowClassFor', () => {
  it('puts every phone in compact', () => {
    expect(windowClassFor(360)).toBe('compact');
    expect(windowClassFor(599)).toBe('compact');
  });

  it('opens medium exactly at 600 and expanded exactly at 840', () => {
    // The boundaries are inclusive-low. Asserted at the exact dp rather than
    // "somewhere in the middle" because an off-by-one here silently hands a
    // 600dp window the phone layout, which is the whole feature missing.
    expect(windowClassFor(CLASS_MEDIUM_MIN)).toBe('medium');
    expect(windowClassFor(CLASS_EXPANDED_MIN - 1)).toBe('medium');
    expect(windowClassFor(CLASS_EXPANDED_MIN)).toBe('expanded');
    expect(windowClassFor(1400)).toBe('expanded');
  });
});

describe('columnsFor', () => {
  it('always returns 1 in compact, however wide the cards are', () => {
    // Compact must be byte-for-byte unchanged (global constraint). A phone in
    // a 599dp window is still a phone.
    expect(columnsFor({ available: 599, minCardWidth: 100, gap: 10, windowClass: 'compact' })).toBe(1);
  });

  it('fits n cards and the n-1 gaps between them, not n gaps', () => {
    // 3 cards of 380 with 2 gaps of 10 = 1160, which fits 1160 exactly.
    // A formula that charges a gap per card gives 2 here and wastes 380dp.
    expect(columnsFor({ available: 1160, minCardWidth: 380, gap: 10, windowClass: 'expanded' })).toBe(3);
    // One dp short of 3 cards -> 2.
    expect(columnsFor({ available: 1159, minCardWidth: 380, gap: 10, windowClass: 'expanded' })).toBe(2);
  });

  it('never returns 0 for a window narrower than one card', () => {
    // A 300dp split-screen pane with a 480dp minimum still has to draw
    // something; 0 columns is a blank screen.
    expect(columnsFor({ available: 300, minCardWidth: 480, gap: 10, windowClass: 'medium' })).toBe(1);
  });

  it('gives back columns as the OS font scale grows', () => {
    // A dp minimum is blind to Android's own font scaling, so the row that
    // fitted at scale 1 wraps at 1.5. Widening the minimum by the scale drops
    // a column instead of shipping a wrapped row.
    const at1 = columnsFor({ available: 1400, minCardWidth: 380, gap: 10, windowClass: 'expanded', fontScale: 1 });
    const at15 = columnsFor({ available: 1400, minCardWidth: 380, gap: 10, windowClass: 'expanded', fontScale: 1.5 });
    expect(at1).toBe(3);
    expect(at15).toBeLessThan(at1);
  });

  it('ignores a font scale below 1', () => {
    // Android allows a scale under 1. Narrowing the minimum would pack more
    // columns than the design was measured for.
    expect(columnsFor({ available: 1400, minCardWidth: 380, gap: 10, windowClass: 'expanded', fontScale: 0.5 })).toBe(3);
  });
});
