'use client';

import { useSearch } from './SearchProvider';

/**
 * The prominent "Search the Quran…" box on the home screen. A button (not a
 * link) so it opens the shared sheet instead of navigating to a page — the
 * sheet is the single search surface.
 */
export function SearchTrigger() {
  const { open } = useSearch();
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search the Quran"
      className="mt-6 flex w-full items-center gap-2 rounded-full border border-paper-200 bg-paper-100 px-4 py-3 text-left text-paper-500 transition-colors hover:bg-paper-200 dark:border-night-100 dark:bg-night-200 dark:text-paper-400 dark:hover:bg-night-100"
    >
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span>Search the Quran…</span>
    </button>
  );
}
