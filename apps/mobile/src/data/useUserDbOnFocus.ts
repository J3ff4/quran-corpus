import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';

import { openUserDb } from './userDb';

export interface UserDbLoadState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
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
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function run() {
        setError(null);
        setLoading(true);
        try {
          const userDb = await openUserDb();
          const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
          const result = await loadRef.current(userClient);
          if (!cancelled) setData(result);
        } catch {
          // Always the localized string, never `cause.message`. A rejected
          // promise here is an expo-sqlite or storage failure, whose message is
          // untranslated internal English and can carry a file path -- neither
          // belongs on screen in a Uzbek or Russian UI.
          if (!cancelled) setError(fallbackMessage);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      run();
      return () => {
        cancelled = true;
      };
    }, [fallbackMessage]),
  );

  return { data, loading, error };
}
