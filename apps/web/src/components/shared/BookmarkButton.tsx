'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isBookmarked, toggleBookmark, type Bookmark } from '../../lib/bookmarks';

// useLayoutEffect warns when React renders it on the server; useEffect there is
// equivalent since server renders run no effects at all.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface BookmarkButtonProps {
  surahId: number;
  ayahNumber: number;
  view: Bookmark['view'];
  /** Server-rendered state, read from the bookmarks cookie by the surah page. */
  initialBookmarked?: boolean;
}

/**
 * Renders the saved state in the server markup — the page reads the bookmarks
 * cookie — so the icon doesn't paint empty and fill in after hydration.
 *
 * The effect still re-reads the cookie: on in-app navigation between surahs
 * React keeps this component mounted and useState ignores the new prop, so
 * without it the icon would show the previous surah's state (see the App
 * Router remount gotcha that bit /dictionary/[root]).
 *
 * It re-reads in a layout effect, not a passive one, because the prop is only
 * a *server* snapshot. Remount the button after the user has toggled something
 * — the WBW card/list switch swaps component type at the same key, so React
 * unmounts and remounts — and the seed is stale; a passive effect would let
 * that stale icon paint for a frame first.
 */
export function BookmarkButton({
  surahId,
  ayahNumber,
  view,
  initialBookmarked = false,
}: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const router = useRouter();

  useIsomorphicLayoutEffect(() => {
    setBookmarked(isBookmarked(surahId, ayahNumber, view));
  }, [surahId, ayahNumber, view]);

  function handleToggle() {
    // Read the cookie rather than trusting `bookmarked`: the layout effect only
    // re-syncs when the ayah identity changes, so another tab (or the
    // MAX_BOOKMARKS eviction) can leave this state disagreeing with the store.
    const before = isBookmarked(surahId, ayahNumber, view);
    const next = toggleBookmark(surahId, ayahNumber, view);
    setBookmarked(next);
    // /bookmarks is rendered on the server from this cookie, and the App
    // Router replays it from the client cache on a back navigation — a payload
    // built before this toggle, so a removed ayah stays listed until a hard
    // reload. Refreshing drops that cache, and the page is rebuilt from the
    // cookie we just wrote. Skipped when the write failed (blocked cookies,
    // size cap): nothing changed, so there is nothing to invalidate.
    if (next !== before) router.refresh();
  }

  return (
    <button
      type="button"
      aria-label={
        bookmarked ? `Remove bookmark, ayah ${ayahNumber}` : `Bookmark ayah ${ayahNumber}`
      }
      aria-pressed={bookmarked}
      onClick={handleToggle}
      className="flex h-6 w-6 items-center justify-center rounded-full text-paper-500 transition-colors hover:bg-paper-200 dark:text-paper-400 dark:hover:bg-night-100"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill={bookmarked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1z" />
      </svg>
    </button>
  );
}
