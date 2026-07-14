import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { SurahFrame } from './ornaments/SurahFrame';

interface SurahHeaderProps {
  surah: Surah;
}

export function SurahHeader({ surah }: SurahHeaderProps) {
  return (
    <header className="mb-8">
      <div className="mb-4">
        <Link
          href="/surah"
          className="text-sm text-paper-500 transition-colors hover:text-paper-700 dark:hover:text-paper-300"
        >
          ← Surahs
        </Link>
      </div>
      <div className="text-center">
        <SurahFrame className="mb-1">
          <p className="font-arabic text-4xl text-paper-900 dark:text-paper-100">
            {surah.name_arabic}
          </p>
        </SurahFrame>
        <p className="text-paper-500 text-lg">{surah.name_translit}</p>
        <p className="mt-1 text-sm text-paper-400 dark:text-paper-500">
          {surah.name_translation} ·{' '}
          {surah.revelation_type.charAt(0).toUpperCase() + surah.revelation_type.slice(1)} ·{' '}
          {surah.ayah_count} ayahs
        </p>
        <Link
          href={`/surah/${surah.id}/words`}
          className="mt-3 inline-block text-sm text-paper-600 hover:text-paper-900 dark:text-paper-400 dark:hover:text-paper-100"
        >
          Word by word →
        </Link>
      </div>
    </header>
  );
}
