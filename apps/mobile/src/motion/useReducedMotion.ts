import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The system "remove animations" setting, kept live. CLAUDE.md §8 requires
 * respecting it; this is mobile's equivalent of web's prefers-reduced-motion.
 *
 * Starts false and settles once the async read resolves -- defaulting true
 * would drop the first frame of every animation on every launch for users who
 * have not asked for that.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // No cancelled flag guarding this resolve: React 19 dropped the
    // setState-after-unmount warning and the call is a no-op, so the guard
    // would be a line no test can tell the absence of.
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    // Android can change this without restarting the app.
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);

  return reduced;
}
