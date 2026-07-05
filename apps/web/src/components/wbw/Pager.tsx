import Link from 'next/link';

export function Pager({ surahId, page, totalPages }: { surahId: number; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const link = 'rounded-lg border border-paper-200 px-4 py-2 text-sm text-paper-700 transition-colors hover:bg-paper-100 dark:border-night-100 dark:text-paper-300 dark:hover:bg-night-200';
  return (
    <nav className="mt-6 flex items-center justify-between" aria-label="Word-by-word pages">
      {page > 1 ? (
        <Link href={`/surah/${surahId}/words?page=${page - 1}`} className={link} rel="prev">
          ← Prev
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-paper-500 dark:text-paper-400">
        Page {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={`/surah/${surahId}/words?page=${page + 1}`} className={link} rel="next">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
