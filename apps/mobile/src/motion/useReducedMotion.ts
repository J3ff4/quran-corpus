import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useAppSettings } from '@/settings/settingsStore';

/**
 * The system flag, held once for the whole app.
 *
 * ONE read and ONE listener, shared by every caller, rather than a pair per
 * component. That is not a micro-optimisation: `usePressScale` calls this, and
 * every row of every browse list calls `usePressScale`, so the old per-caller
 * version fired an async AccessibilityInfo read AND registered a listener for
 * every row a list mounted -- then re-rendered each row separately as its own
 * read resolved. All of it lands on the JS thread inside the commit that
 * mounts the list, which is what made a tab switch on Surahs and Dictionary
 * stutter while Bookmarks, whose rows do not use press scaling, was fine
 * (2026-08-31). A test in this module's suite pins the count at one.
 *
 * Module state rather than a context: there is no provider to forget, no
 * re-render of a subtree when it changes, and nothing above these components
 * to hang it on -- the value is a property of the device, not of the tree.
 *
 * The read happens once for the life of the process, and a later subscriber
 * gets the cached answer with no native call and nothing re-rendered.
 */
let systemReduced = false;
let started = false;
const subscribers = new Set<() => void>();

function publish(value: boolean) {
  // Compared before publishing: Android re-emits the current value on some
  // builds, and waking every row in the app to tell it nothing changed is the
  // cost this module exists to avoid.
  if (value === systemReduced) return;
  systemReduced = value;
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  if (!started) {
    started = true;
    // No cancelled flag on the resolve: publish is a no-op when the value has
    // not moved, and there is no unsubscribe for it to race with.
    void AccessibilityInfo.isReduceMotionEnabled().then(publish);
    AccessibilityInfo.addEventListener('reduceMotionChanged', publish);
  }
  // Started once and never torn down, deliberately.
  //
  // A refcounted teardown looks tidier and is worse: switching a tab unmounts
  // every row of the old list BEFORE the new list's rows mount, so the count
  // passes through zero on every switch. That tore the listener down, made the
  // next row pay for a fresh async read, and then woke every subscriber in the
  // app when it resolved -- a stutter on each switch, which is what the first
  // version of this shipped (device, 2026-08-31).
  //
  // What is retained is one listener and one boolean for the life of the
  // process. The device setting outlives every screen that asks about it.
  return () => {
    subscribers.delete(notify);
  };
}

function getSnapshot(): boolean {
  return systemReduced;
}

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
  // getServerSnapshot is the same function: there is no server, and passing it
  // is what keeps this usable from a component rendered under any renderer
  // that asks for one.
  const system = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { reduceMotion } = useAppSettings();

  // OR, never override. The system flag is a user's standing instruction to
  // every app; an in-app switch that could turn it back off would be an app
  // overruling an accessibility setting. Coerced because every component test
  // in this app mocks the settings store with a partial object, so the field
  // can legitimately be undefined and this hook's return type is boolean.
  return system || Boolean(reduceMotion);
}
