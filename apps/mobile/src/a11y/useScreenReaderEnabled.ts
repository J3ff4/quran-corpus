import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether TalkBack (or any screen reader) is running, held once for the whole
 * app -- one native read and one listener, shared, exactly as
 * `useReducedMotion` does and for the same reason.
 *
 * The reader uses it to decide whether an ayah's word rows are worth a
 * re-render. They carry the transliterations TalkBack needs to announce a word
 * instead of spelling the Arabic out character by character, and nothing else
 * that render depends on -- so with no screen reader running the rows stay out
 * of render entirely and the card is drawn once (see AyahText).
 *
 * Starts false and settles when the async read resolves. A screen reader is
 * started before the app is opened in practice, and a late `true` only costs
 * the one re-render it turns on.
 */
let enabled = false;
let started = false;
const subscribers = new Set<() => void>();

function publish(value: boolean) {
  if (value === enabled) return;
  enabled = value;
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  if (!started) {
    started = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(publish);
    AccessibilityInfo.addEventListener('screenReaderChanged', publish);
  }
  return () => {
    subscribers.delete(notify);
  };
}

function getSnapshot(): boolean {
  return enabled;
}

export function useScreenReaderEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
