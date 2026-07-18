'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PickerSurah } from '../../components/wbw/types';
import { getBookmarks, type Bookmark } from '../../lib/bookmarks';

interface BookmarkRow extends Bookmark {
  surahName: string;
}

export function BookmarksView() {
  const [rows, setRows] = useState<BookmarkRow[] | null>(null);
  // Holds the resolved id->name map so the storage-event handler below can
  // recompute rows on cross-tab bookmark changes without refetching /api/surahs.
  const nameByIdRef = useRef<Map<number, string>>(new Map());

  const buildRows = () =>
    getBookmarks().map((b) => ({
      ...b,
      surahName: nameByIdRef.current.get(b.surahId) ?? `Surah ${b.surahId}`,
    }));

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/surahs', { signal: ctrl.signal });
        // Surah names are cosmetic; if the fetch fails (e.g. offline) fall back
        // to an empty map rather than dropping bookmarks that exist in localStorage.
        nameByIdRef.current = res.ok
          ? new Map(((await res.json()) as PickerSurah[]).map((s) => [s.id, s.name_translit]))
          : new Map<number, string>();
        setRows(buildRows());
      } catch {
        setRows(buildRows());
      }
    })();

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'bookmarks') return;
      setRows(buildRows());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      ctrl.abort();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">Bookmarks</h1>
      {rows === null ? null : rows.length === 0 ? (
        <p className="text-paper-500">
          No bookmarks yet. Tap the bookmark icon on any ayah to save it here.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => (
            <li key={`${b.surahId}-${b.ayahNumber}-${b.view}`}>
              <Link
                href={
                  b.view === 'wbw'
                    ? `/surah/${b.surahId}/words?ayah=${b.ayahNumber}`
                    : `/surah/${b.surahId}?ayah=${b.ayahNumber}`
                }
                className="flex items-center justify-between rounded-xl bg-paper-100 px-4 py-3 transition-colors hover:bg-paper-200 dark:bg-night-200 dark:hover:bg-night-100"
              >
                <span className="text-sm font-medium text-paper-700 dark:text-paper-300">
                  {b.surahName} {b.ayahNumber}
                </span>
                <span className="text-xs uppercase tracking-wide text-paper-400 dark:text-paper-500">
                  {b.view === 'wbw' ? 'Word-by-word' : 'Reading'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
