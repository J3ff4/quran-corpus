import { useCallback, useRef, useState } from 'react';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';

import { openUserDb } from '@/data/userDb';
import { getKhatmPage, setKhatmPage } from '@/data/userRepository';
import { useUserDbOnFocus } from '@/data/useUserDbOnFocus';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';

export interface KhatmMark {
  /** The marked page, or null when nothing is marked. */
  markedPage: number | null;
  mark: (page: number, firstAyah: { surahId: number; ayahNumber: number }) => Promise<void>;
  lift: () => Promise<void>;
  /** Nothing to show yet -- see useUserDbOnFocus's own `loading` doc. */
  loading: boolean;
}

/** What `markedPage` shows instead of the stored value, or null to defer to it. */
type Override = { page: number | null } | null;

/**
 * The khatm mark: where the reader deliberately stopped, read on every focus
 * and resume via `useUserDbOnFocus` (the shared read path -- growing a second
 * copy here is the exact duplication that hook's own docstring calls out).
 *
 * `mark`/`lift` are optimistic: the ribbon has to appear on the tap, not on
 * the next focus, or its entrance animation plays against a page that still
 * looks unmarked (Task 3's concern, not built here). The override this keeps
 * wins over a later focus read -- safe only because nothing else in the app
 * writes `khatm_page`, so there is no second writer for a stray read to race.
 */
export function useKhatmMark(uiLocale: UiLocaleCode): KhatmMark {
  const stored = useUserDbOnFocus(getKhatmPage, t(uiLocale, 'mushaf.khatmLoadFailed'));
  const [override, setOverride] = useState<Override>(null);

  // Mirrored in a ref so `write` can read and restore it without taking
  // `override` as a dependency. It used to, and `useUserDbOnFocus` returns a
  // fresh object every render, so `mark` and `lift` were new functions on
  // every render -- handed to a chrome button above a PagerView that
  // re-renders all 604 of its children whenever a prop changes identity.
  const overrideRef = useRef<Override>(null);
  const apply = useCallback((next: Override) => {
    overrideRef.current = next;
    setOverride(next);
  }, []);

  /**
   * The last value a write actually got into the database, or null while none
   * has -- which is what a failed write rolls back to.
   *
   * Not "whatever the override was before this write": two writes can be in
   * flight, and if the earlier one failed then its predecessor is not a value
   * the database ever held. Rolling back to the last confirmed value is right
   * in every ordering, and null correctly falls through to `stored.data`.
   */
  const confirmed = useRef<Override>(null);

  /**
   * Which write is the newest. Only the newest may roll back.
   *
   * Two taps in quick succession can resolve out of order, and a rollback from
   * the older one would paint its own stale value over the newer one's -- "no
   * mark" on a page the database has just marked. `useUserDbOnFocus` guards
   * its reads with the same counter, for the same reason.
   */
  const generation = useRef(0);

  // Stable for the life of the mount: `useCallback(() => runRef.current(), [])`.
  const reload = stored.reload;

  const write = useCallback(
    async (input: { page: number | null; surahId: number; ayahNumber: number }) => {
      const mine = ++generation.current;
      apply({ page: input.page });
      try {
        // No client in state to reuse: MushafScreen keeps only the corpus
        // client mounted and opens the user DB per write (toggleBookmark,
        // recordReadingPosition), so this follows the same shape.
        const userDb = await openUserDb();
        const client = createExpoSqliteClient(userDb as ExpoSqliteLike);
        await setKhatmPage(client, input);
        confirmed.current = { page: input.page };
        // Not awaited. The override already shows what was stored; this keeps
        // `stored.data` honest for the rollback path above, which falls
        // through to it whenever nothing has been confirmed yet.
        reload();
      } catch (cause) {
        if (mine === generation.current) apply(confirmed.current);
        throw cause;
      }
    },
    [apply, reload],
  );

  const mark = useCallback(
    (page: number, firstAyah: { surahId: number; ayahNumber: number }) =>
      write({ page, surahId: firstAyah.surahId, ayahNumber: firstAyah.ayahNumber }),
    [write],
  );

  const lift = useCallback(
    () =>
      // lift() is only reachable when a mark already exists, so the
      // reading_history row already exists and setKhatmPage's ON CONFLICT
      // upsert discards whatever coordinates are passed here -- see
      // KhatmPageInput's doc in packages/data/src/userData.ts. Surah 1, ayah 1
      // is valid and inert: not a real position, just satisfying the NOT NULL
      // columns that this path never touches.
      write({ page: null, surahId: 1, ayahNumber: 1 }),
    [write],
  );

  return {
    markedPage: override ? override.page : stored.data,
    mark,
    lift,
    loading: stored.loading,
  };
}
