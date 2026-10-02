import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

import { CLASS_MEDIUM_MIN } from '@/theme/windowClass';

/**
 * Whether this window is too small to lay a mushaf page out on its side.
 *
 * The SHORT side, not the current width: a phone held in landscape is 800dp
 * wide and would pass a width test, which is the configuration the lock exists
 * to prevent. Short side is also what stays put while the screen rotates, so
 * the answer cannot oscillate with the thing it controls.
 *
 * 600dp is Material's own medium cut (`CLASS_MEDIUM_MIN`) and Android's `sw600dp`
 * resource qualifier -- the line the platform already draws between a phone and
 * a large screen. A fold lands on the right side of it in both states: open it
 * reports a short side around 670-780dp and keeps landscape and the two-page
 * spread; folded, its cover screen is ~320dp and is a phone, which is what it
 * is. Measured on the window rather than the screen, so a tablet in
 * split-screen is treated as the narrow box it genuinely is.
 */
export function tooShortForLandscape(width: number, height: number): boolean {
  return Math.min(width, height) < CLASS_MEDIUM_MIN;
}

/**
 * Hold the mushaf in portrait on anything phone-shaped, while `active`.
 *
 * Not a style preference -- an arithmetic one. 15 lines of this type need
 * ~28.5em of height, and a phone turned on its side offers a 19.2dp line box
 * for type that wants up to 2.2112em of it. The honest fit is 8.7dp, which is
 * not a reading surface, and the floor that stops the shrink (see
 * MUSHAF_MIN_FONT_SIZE) buys legibility back by letting the glyphs overhang
 * their line again. Neither is a page worth turning to, so the page does not
 * go there (owner, 2026-10-02).
 *
 * Scoped to `active` so the lock lives exactly as long as the mushaf is on
 * screen: every other surface in the app scrolls and is fine on its side.
 */
export function useMushafPortraitLock(active: boolean): void {
  const { width, height } = useWindowDimensions();
  const locked = active && tooShortForLandscape(width, height);

  useEffect(() => {
    if (!locked) return;
    // Chained rather than fired side by side: these two race inside the native
    // module, and an unlock that beats its own lock leaves the whole app pinned
    // to portrait -- on every screen, until the process restarts.
    const pending = ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    void pending.catch(() => undefined);
    return () => {
      void pending
        .catch(() => undefined)
        // Back to `app.json`'s "default", not to a landscape lock of our own:
        // the app is unlocked everywhere else and this only ever borrowed it.
        .then(() => ScreenOrientation.unlockAsync())
        .catch(() => undefined);
    };
  }, [locked]);
}
