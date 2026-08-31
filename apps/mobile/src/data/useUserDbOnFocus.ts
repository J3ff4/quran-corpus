import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';

import { openUserDb } from './userDb';

export interface UserDbLoadState<T> {
  data: T | null;
  /**
   * True only while there is nothing to show yet -- NOT "a read is in flight".
   *
   * Every consumer renders this as a spinner, and this hook re-reads on every
   * focus, every resume and after every write. A flag that tracked the read
   * itself therefore put a spinner on screen beside data that was already
   * correct, and took it away again a moment later. On Bookmarks that indicator
   * sits in a gapped column above the list, so deleting a row pushed the whole
   * list down and back -- the "jump" reported on 2026-08-31. On Home the same
   * flag blanked the continue-reading card and both counters on every return to
   * the tab.
   *
   * A refresh that fails still reports through `error`, so a re-read that is
   * silent while it works is not silent when it breaks.
   */
  loading: boolean;
  error: string | null;
  /** Re-read now, without waiting for the next focus or resume.
   *
   *  For a screen that writes to the same database it is reading: after a
   *  write, what is on screen must be what was stored, not what the screen
   *  hoped was stored. Patching local state instead would show the note the
   *  user typed rather than the note `normalizeNote` kept. */
  reload: () => void;
}

/**
 * Read from the user DB every time a screen gains focus.
 *
 * Three screens had grown their own copy of this: useFocusEffect + a cancelled
 * flag + openUserDb + the `as ExpoSqliteLike` cast + guarded setError/setLoading.
 * Each copy carried its own English fallback string and could drift on its own,
 * and the cancellation guard -- the part that actually prevents a setState after
 * blur -- was duplicated rather than tested once.
 *
 * On focus rather than on mount because the reader writes as you scroll, so a
 * mount-only read shows whatever was true the last time the tab mounted.
 *
 * And on resume as well as on focus, because focus does not fire again for the
 * tab you were already on. Home is the launch screen, so backgrounding the app
 * there and reopening it is the common case, and the numbers it shows are
 * dated: a device run on 2026-08-24 left Home focused across a day boundary and
 * it kept yesterday's streak until the tab was switched away and back.
 */
export function useUserDbOnFocus<T>(
  load: (client: MobileDataClient) => Promise<T>,
  fallbackMessage: string,
): UserDbLoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Held in a ref so callers may pass an inline closure without the focus
  // effect re-subscribing on every render.
  const loadRef = useRef(load);
  // The focused read, exposed for `reload`. Assigned inside the effect because
  // that is where the cancellation flag and the generation counter live: a
  // reload has to be the *same* run those guard, or its result could land after
  // a blur that was supposed to have silenced it.
  const runRef = useRef<() => void>(() => {});
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // A resume can arrive while the focus read is still in flight, and the
      // two reads can then settle out of order. Only the newest may write:
      // stamping the older result over it is the same defect as painting 0
      // while loading -- a wrong number, not a stale one.
      let generation = 0;

      async function run() {
        const mine = ++generation;
        const current = () => !cancelled && mine === generation;
        setError(null);
        setLoading(true);
        try {
          const userDb = await openUserDb();
          const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
          const result = await loadRef.current(userClient);
          if (current()) setData(result);
        } catch (cause) {
          console.error('[user-db] read failed', cause);
          // Always the localized string, never `cause.message`. A rejected
          // promise here is an expo-sqlite or storage failure, whose message is
          // untranslated internal English and can carry a file path -- neither
          // belongs on screen in a Uzbek or Russian UI.
          if (current()) setError(fallbackMessage);
        } finally {
          if (current()) setLoading(false);
        }
      }

      runRef.current = run;
      run();
      // Subscribed only while focused, so a backgrounded app does not re-read
      // the DB once per blurred screen.
      const resumed = AppState.addEventListener('change', (state) => {
        if (state === 'active') run();
      });

      return () => {
        cancelled = true;
        // Back to a no-op: a reload fired after blur would otherwise re-read
        // the database for a screen that is no longer listening.
        runRef.current = () => {};
        resumed.remove();
      };
    }, [fallbackMessage]),
  );

  const reload = useCallback(() => runRef.current(), []);

  // `loading` is narrowed to "nothing to show yet" here rather than at each
  // call site: two screens read it across four calls, all of them render it as
  // a spinner, and the one that got it wrong got it wrong invisibly. See
  // UserDbLoadState.
  return { data, loading: loading && data === null, error, reload };
}
