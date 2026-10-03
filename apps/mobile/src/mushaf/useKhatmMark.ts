import { useCallback, useState } from 'react';
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
 *
 * On a rejected write the override is restored to what it was before the
 * write, not cleared to null: null falls through to `stored.data`, which may
 * itself already be a mark. Clearing unconditionally would paint "no mark"
 * over a page that still has one, for a write that failed to remove it.
 */
export function useKhatmMark(uiLocale: UiLocaleCode): KhatmMark {
  const stored = useUserDbOnFocus(getKhatmPage, t(uiLocale, 'mushaf.khatmLoadFailed'));
  const [override, setOverride] = useState<{ page: number | null } | null>(null);

  const write = useCallback(
    async (input: { page: number | null; surahId: number; ayahNumber: number }) => {
      const previous = override;
      setOverride({ page: input.page });
      try {
        // No client in state to reuse: MushafScreen keeps only the corpus
        // client mounted and opens the user DB per write (toggleBookmark,
        // recordReadingPosition), so this follows the same shape.
        const userDb = await openUserDb();
        const client = createExpoSqliteClient(userDb as ExpoSqliteLike);
        await setKhatmPage(client, input);
        stored.reload();
      } catch (cause) {
        setOverride(previous);
        throw cause;
      }
    },
    [override, stored],
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
