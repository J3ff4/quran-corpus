import { useSyncExternalStore } from 'react';

/** How long the chrome stays up with nothing touching it (ruling 7).
 *
 *  3.5s: long enough to read the page number and reach the jump control, short
 *  enough that a reader who tapped by accident is not left with a bar over the
 *  text. */
export const CHROME_IDLE_MS = 3500;

/**
 * Whether the mushaf's chrome -- its compact header AND the app's tab bar --
 * is on screen.
 *
 * Module state rather than a context, following `useReducedMotion`: the tab bar
 * is rendered by the tabs navigator and the mushaf screen is rendered inside
 * it, so a provider low enough for the screen to own would be below the bar
 * that has to read it, and one high enough for the bar would re-render every
 * tab on every toggle. Nothing above them both is a natural owner.
 *
 * It defaults to visible and every screen other than the mushaf leaves it
 * alone, so the bar behaves exactly as it did everywhere else.
 */
let visible = true;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (visible === next) return;
  visible = next;
  for (const listener of listeners) listener();
}

function stopTimer() {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
}

/** Show it, and start the idle countdown again. Every interaction calls this. */
export function showChrome() {
  stopTimer();
  set(true);
  timer = setTimeout(() => {
    timer = null;
    set(false);
  }, CHROME_IDLE_MS);
}

export function hideChrome() {
  stopTimer();
  set(false);
}

export function toggleChrome() {
  if (visible) hideChrome();
  else showChrome();
}

/** Leaving the mushaf. The chrome is the tab bar too, and a screen that
 *  unmounted while hidden would take the app's navigation with it. */
export function releaseChrome() {
  stopTimer();
  set(true);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChromeVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => visible,
    () => visible,
  );
}
