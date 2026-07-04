import Link from 'next/link';
import type { Root } from '@quran-corpus/data';

interface RootListRowProps {
  root: Root;
}

/**
 * Shared root list row: Arabic root + occurrence count, linking to the root
 * entry (href keyed by Buckwalter slug). Reused by the dictionary index, search
 * results, and the frequency browse (DRY).
 */
export function RootListRow({ root }: RootListRowProps) {
  return (
    <Link
      href={`/dictionary/${root.root_buckwalter}`}
      className="flex items-center justify-between gap-4 rounded-lg px-4 py-3 transition-colors hover:bg-paper-200 dark:hover:bg-night-100"
    >
      <span className="flex items-baseline gap-3">
        <span dir="rtl" className="font-arabic text-2xl text-paper-900 dark:text-paper-100">
          {root.root_arabic}
        </span>
      </span>
      <span className="rounded-full bg-paper-200 px-3 py-0.5 text-sm text-paper-700 dark:bg-night-100 dark:text-paper-300">
        {root.occurrence_count}
      </span>
    </Link>
  );
}
