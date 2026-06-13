import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';

interface SurahCardProps {
  surah: Surah;
}

export function SurahCard({ surah }: SurahCardProps) {
  return (
    <Link href={`/surah/${surah.id}`}>
      <div className="group flex items-center gap-4 rounded-xl bg-paper-100 px-4 py-3 transition-colors hover:bg-paper-200 dark:bg-night-200 dark:hover:bg-night-100">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper-300 text-sm font-medium text-paper-700 dark:bg-night-50 dark:text-paper-300">
          {surah.id}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-paper-500 dark:text-paper-400">
              {surah.name_translit}
            </p>
            <p className="mt-0.5 text-xs text-paper-400 dark:text-paper-500">
              <span>{surah.revelation_type.charAt(0).toUpperCase() + surah.revelation_type.slice(1)}</span>
              <span>{' · '}</span>
              <span>{surah.ayah_count} ayahs</span>
            </p>
          </div>
          <p className="font-arabic text-2xl text-paper-900 dark:text-paper-100">
            {surah.name_arabic}
          </p>
        </div>
      </div>
    </Link>
  );
}
