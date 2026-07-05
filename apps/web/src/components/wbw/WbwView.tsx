import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { WbwAyahBlock } from './WbwAyahBlock';
import { Pager } from './Pager';
import { ScrollToAyah } from './ScrollToAyah';
import type { WbwAyah } from './types';

interface WbwViewProps {
  surah: Surah;
  ayahs: WbwAyah[];
  page: number;
  totalPages: number;
  scrollAyah: number | null;
}

export function WbwView({ surah, ayahs, page, totalPages, scrollAyah }: WbwViewProps) {
  return (
    <div>
      <header className="mb-4 text-center">
        <p className="font-arabic text-3xl text-paper-900 dark:text-paper-100">{surah.name_arabic}</p>
        <h1 className="text-paper-500">
          <span>{surah.name_translit}</span> · word by word
        </h1>
        <Link
          href={`/surah/${surah.id}`}
          className="mt-2 inline-block text-sm text-paper-600 hover:text-paper-900 dark:text-paper-400 dark:hover:text-paper-100"
        >
          ← Read (mushaf)
        </Link>
      </header>

      {ayahs.map((ayah) => (
        <WbwAyahBlock key={ayah.ayahNumber} ayah={ayah} />
      ))}

      <Pager surahId={surah.id} page={page} totalPages={totalPages} />
      {scrollAyah != null && <ScrollToAyah ayah={scrollAyah} />}
    </div>
  );
}
