import { CLASS_MEDIUM_MIN } from '@/theme/windowClass';

export interface OrientationPolicyDeps {
  /** min(screen width, screen height) -- the device's own smallest width, not
   *  the current window's. A phone in landscape is an 800dp-wide window. */
  smallestWidth: number;
  lock: (orientation: number) => Promise<void>;
  portraitUp: number;
}

/**
 * Portrait on a phone, free above 600dp (owner ruling R3, 2026-09-28).
 *
 * Android only takes a static per-activity orientation, so the manifest says
 * "default" and this re-applies the phone lock at launch.
 *
 * A refused lock resolves 'free' rather than throwing: some OEM skins reject
 * the call, and an unhandled rejection at launch is a crash on the splash
 * screen. A phone that rotates is a cosmetic miss; a phone that will not start
 * is not.
 */
export async function applyOrientationPolicy({
  smallestWidth,
  lock,
  portraitUp,
}: OrientationPolicyDeps): Promise<'locked' | 'free'> {
  if (smallestWidth >= CLASS_MEDIUM_MIN) return 'free';
  try {
    await lock(portraitUp);
    return 'locked';
  } catch {
    return 'free';
  }
}
