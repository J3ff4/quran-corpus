import { describe, expect, it, vi } from 'vitest';

// orientation.ts imports CLASS_MEDIUM_MIN from windowClass.ts, which imports
// useWindowDimensions from 'react-native' at module scope -- unused here, but
// every RN-importing module needs 'react-native' mocked under this repo's
// vitest/jsdom setup regardless, since the real package source does not parse
// (see windowClass.test.ts).
vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: 0, height: 0, scale: 1, fontScale: 1 }),
}));

import { applyOrientationPolicy } from './orientation';

const PORTRAIT_UP = 1;

describe('applyOrientationPolicy', () => {
  it('locks a phone to portrait', async () => {
    const lock = vi.fn(async () => {});
    const unlock = vi.fn(async () => {});
    await expect(
      applyOrientationPolicy({ smallestWidth: 360, lock, unlock, portraitUp: PORTRAIT_UP }),
    ).resolves.toBe('locked');
    expect(lock).toHaveBeenCalledWith(PORTRAIT_UP);
  });

  it('leaves a tablet free', async () => {
    const lock = vi.fn(async () => {});
    const unlock = vi.fn(async () => {});
    await expect(
      applyOrientationPolicy({ smallestWidth: 800, lock, unlock, portraitUp: PORTRAIT_UP }),
    ).resolves.toBe('free');
    expect(lock).not.toHaveBeenCalled();
    // Not merely "does not lock": on a foldable launched folded this policy
    // has ALREADY locked portrait, and the manifest default it would
    // otherwise fall back to is gone from that moment. Without this the large
    // inner display stays pinned to portrait for the rest of the session.
    expect(unlock).toHaveBeenCalled();
  });

  it('does not take the app down when the unlock rejects either', async () => {
    const lock = vi.fn(async () => {});
    const unlock = vi.fn(async () => {
      throw new Error('not permitted');
    });
    await expect(
      applyOrientationPolicy({ smallestWidth: 800, lock, unlock, portraitUp: PORTRAIT_UP }),
    ).resolves.toBe('free');
  });

  it('decides on the SMALLEST width, so a rotated phone stays locked', async () => {
    // The whole point of smallestWidth. A phone in landscape is an 800dp-wide
    // window; keying off window width would unlock it after one rotation and
    // it would never lock again.
    const lock = vi.fn(async () => {});
    const unlock = vi.fn(async () => {});
    await expect(
      applyOrientationPolicy({ smallestWidth: 360, lock, unlock, portraitUp: PORTRAIT_UP }),
    ).resolves.toBe('locked');
  });

  it('frees exactly at 600dp', async () => {
    const lock = vi.fn(async () => {});
    const unlock = vi.fn(async () => {});
    expect(await applyOrientationPolicy({ smallestWidth: 599, lock, unlock, portraitUp: PORTRAIT_UP })).toBe('locked');
    expect(await applyOrientationPolicy({ smallestWidth: 600, lock, unlock, portraitUp: PORTRAIT_UP })).toBe('free');
  });

  it('does not take the app down when the lock rejects', async () => {
    // Some OEM skins refuse the call. A rejected promise at launch, unhandled,
    // is a crash on the splash screen -- the worst place in the app to have one.
    const lock = vi.fn(async () => {
      throw new Error('not permitted');
    });
    const unlock = vi.fn(async () => {});
    await expect(
      applyOrientationPolicy({ smallestWidth: 360, lock, unlock, portraitUp: PORTRAIT_UP }),
    ).resolves.toBe('free');
  });
});
