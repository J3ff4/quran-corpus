import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tooShortForLandscape, useMushafPortraitLock } from './orientationLock';

// Mutable, so each case below can state the window it is about. Built from
// scratch rather than spread over the real module: react-native's entry is
// Flow-typed source that vitest cannot parse, which is why every suite here
// declares the handful of exports it actually touches.
const win = { width: 412, height: 915 };
vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ ...win, scale: 3, fontScale: 1 }),
}));

function Probe({ active }: { active: boolean }) {
  useMushafPortraitLock(active);
  return null;
}

const lockAsync = vi.mocked(ScreenOrientation.lockAsync);
const unlockAsync = vi.mocked(ScreenOrientation.unlockAsync);

beforeEach(() => {
  lockAsync.mockClear();
  unlockAsync.mockClear();
});
afterEach(cleanup);

describe('tooShortForLandscape', () => {
  it('measures the short side, so a phone held sideways still counts as a phone', () => {
    // The whole point. A landscape phone is 800dp WIDE, so a width test passes
    // it -- and landscape is the configuration being prevented.
    expect(tooShortForLandscape(800, 360)).toBe(true);
    expect(tooShortForLandscape(360, 800)).toBe(true);
  });

  it('lets a fold keep its spread open and takes it away folded', () => {
    // Open, both ways round: short side ~670-780dp, clear of Material's 600.
    expect(tooShortForLandscape(1812 / 2.33, 2176 / 2.33)).toBe(false);
    expect(tooShortForLandscape(930, 775)).toBe(false);
    // The cover screen is a phone and is treated as one.
    expect(tooShortForLandscape(320, 822)).toBe(true);
  });

  it('keeps the tablet unlocked in both orientations', () => {
    expect(tooShortForLandscape(1400, 876)).toBe(false);
    expect(tooShortForLandscape(876, 1400)).toBe(false);
  });

  it('treats a split-screen tablet as the narrow window it is', () => {
    // Measured on the window, never the screen: half of a 1400dp tablet is a
    // genuinely compact box, however large the panel it is glued to.
    expect(tooShortForLandscape(1400, 430)).toBe(true);
  });
});

describe('useMushafPortraitLock', () => {
  it('locks a phone while the mushaf is the screen being looked at', async () => {
    win.width = 412;
    win.height = 915;
    const view = render(createElement(Probe, { active: true }));
    expect(lockAsync).toHaveBeenCalledWith('PORTRAIT_UP');
    // And gives it back on blur, rather than pinning the whole app. Awaited
    // rather than checked on the next microtask: the unlock is CHAINED behind
    // the lock on purpose, so it lands two ticks later -- and a single-tick
    // assertion would fail on the correct implementation.
    act(() => view.unmount());
    await vi.waitFor(() => expect(unlockAsync).toHaveBeenCalled());
  });

  it('leaves a tablet alone', () => {
    win.width = 1400;
    win.height = 876;
    render(createElement(Probe, { active: true }));
    expect(lockAsync).not.toHaveBeenCalled();
  });

  it('leaves a phone alone while the mushaf is not on screen', () => {
    // Every other surface in the app scrolls and reads fine on its side, so
    // the lock must not outlive the page that needs it.
    win.width = 412;
    win.height = 915;
    render(createElement(Probe, { active: false }));
    expect(lockAsync).not.toHaveBeenCalled();
  });
});
