import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useAppSettings } from '@/settings/settingsStore';

/**
 * The system "remove animations" setting OR the in-app one, kept live.
 * CLAUDE.md §8 requires respecting the system flag; this is mobile's
 * equivalent of web's prefers-reduced-motion.
 *
 * The in-app switch exists because the OS one is not reachable at a single
 * documented path: Pixel puts it under Accessibility, Samsung under Visibility
 * enhancements, and some builds only expose it as a developer option. The
 * owner's device had none of them (device report, 2026-08-16), which made the
 * setting untestable on real hardware.
 *
 * Starts false and settles once the async read resolves -- defaulting true
 * would drop the first frame of every animation on every launch for users who
 * have not asked for that.
 */
export function useReducedMotion(): boolean {
  const [systemReduced, setSystemReduced] = useState(false);
  const { reduceMotion } = useAppSettings();

  useEffect(() => {
    // No cancelled flag guarding this resolve: React 19 dropped the
    // setState-after-unmount warning and the call is a no-op, so the guard
    // would be a line no test can tell the absence of.
    void AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduced);
    // Android can change this without restarting the app.
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    return () => subscription.remove();
  }, []);

  // OR, never override. The system flag is a user's standing instruction to
  // every app; an in-app switch that could turn it back off would be an app
  // overruling an accessibility setting. Coerced because every component test
  // in this app mocks the settings store with a partial object, so the field
  // can legitimately be undefined and this hook's return type is boolean.
  return systemReduced || Boolean(reduceMotion);
}
