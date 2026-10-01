import { CLASS_MEDIUM_MIN } from '@/theme/windowClass';

export interface OrientationPolicyDeps {
  /** min(screen width, screen height) -- the device's own smallest width, not
   *  the current window's. A phone in landscape is an 800dp-wide window. */
  smallestWidth: number;
  lock: (orientation: number) => Promise<void>;
  /** Undoes a lock this policy applied earlier. Load-bearing on a foldable:
   *  launched folded the policy locks portrait, and the manifest default it
   *  would otherwise be relying on is gone from that moment on, so unfolding
   *  leaves the large inner display pinned to portrait with no path back. */
  unlock: () => Promise<void>;
  portraitUp: number;
}

/**
 * Portrait on a phone, free above 600dp (owner ruling R3, 2026-09-28).
 *
 * Android only takes a static per-activity orientation, so the manifest says
 * "default" and this re-applies the phone lock at launch.
 *
 * Re-runnable, and re-run on every screen-size change: a foldable is a phone
 * and a tablet in one activity, and the lock is per-activity, so a policy
 * evaluated once at launch is wrong for the rest of the session on exactly
 * the device that needs it most.
 *
 * A refused call resolves 'free' rather than throwing: some OEM skins reject
 * it, and an unhandled rejection at launch is a crash on the splash screen. A
 * phone that rotates is a cosmetic miss; a phone that will not start is not.
 */
export async function applyOrientationPolicy({
  smallestWidth,
  lock,
  unlock,
  portraitUp,
}: OrientationPolicyDeps): Promise<'locked' | 'free'> {
  if (smallestWidth >= CLASS_MEDIUM_MIN) {
    try {
      await unlock();
    } catch {
      // Nothing to undo, or the skin refused. Either way the window is as
      // free as this policy can make it.
    }
    return 'free';
  }
  try {
    await lock(portraitUp);
    return 'locked';
  } catch {
    return 'free';
  }
}
