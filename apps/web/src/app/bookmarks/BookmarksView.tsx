import Link from 'next/link';
import { TypingText } from '../../components/ui/TypingText';
import type { Bookmark } from '../../lib/bookmarks';

export interface BookmarkRow extends Bookmark {
  surahName: string;
}

export function BookmarksView({ rows }: { rows: BookmarkRow[] }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">Bookmarks</h1>
      {rows.length === 0 ? (
        <TypingText
          text="No bookmarks yet. Tap the bookmark icon on any ayah to save it here."
          className="text-paper-500"
        />
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
