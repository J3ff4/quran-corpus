'use client';

import { useEffect, useState } from 'react';
import { isBookmarked, toggleBookmark, type Bookmark } from '../../lib/bookmarks';

interface BookmarkButtonProps {
  surahId: number;
  ayahNumber: number;
  view: Bookmark['view'];
}

/**
 * Starts unbookmarked on the server-rendered markup and reconciles after mount
 * (same SSR-safe pattern as the theme toggle) to avoid a hydration mismatch.
 * Unlike the bookmarks page, the surrounding ayah lists don't read the cookie
 * server-side, so this icon still resolves on the client.
 */
export function BookmarkButton({ surahId, ayahNumber, view }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    setBookmarked(isBookmarked(surahId, ayahNumber, view));
  }, [surahId, ayahNumber, view]);

  return (
    <button
      type="button"
      aria-label={
        bookmarked ? `Remove bookmark, ayah ${ayahNumber}` : `Bookmark ayah ${ayahNumber}`
      }
      aria-pressed={bookmarked}
      onClick={() => setBookmarked(toggleBookmark(surahId, ayahNumber, view))}
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
