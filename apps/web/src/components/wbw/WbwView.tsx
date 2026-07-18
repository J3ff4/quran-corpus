import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { Bismillah } from '../reader/ornaments/Bismillah';
import { SurahFrame } from '../reader/ornaments/SurahFrame';
import { surahNameGlyph } from '../reader/ornaments/surahNameGlyph';
import { WbwAyahBlock } from './WbwAyahBlock';
import { Pager } from './Pager';
import { ScrollToAyah } from '../shared/ScrollToAyah';
import type { WbwAyah } from './types';

interface WbwViewProps {
  surah: Surah;
  ayahs: WbwAyah[];
  page: number;
  totalPages: number;
  scrollAyah: number | null;
  pageLang?: string;
}

export function WbwView({ surah, ayahs, page, totalPages, scrollAyah, pageLang }: WbwViewProps) {
  return (
    <div>
      <header className="mb-4 text-center">
        <SurahFrame>
          <p
            className={`text-[1.9rem] leading-none text-paper-900 dark:text-paper-100 ${
              surah.id === 102 ? 'font-surah-name-v4' : 'font-surah-name'
            }`}
            aria-hidden="true"
          >
            {surahNameGlyph(surah.id)}
          </p>
          <span className="sr-only">{surah.name_arabic}</span>
        </SurahFrame>
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

      {page === 1 && <Bismillah surahId={surah.id} />}

      {ayahs.map((ayah) => (
        <WbwAyahBlock
          key={ayah.ayahNumber}
          surahId={surah.id}
          ayah={ayah}
          {...(pageLang ? { pageLang } : {})}
        />
      ))}

      <Pager surahId={surah.id} page={page} totalPages={totalPages} />
      {scrollAyah != null && <ScrollToAyah ayah={scrollAyah} />}
    </div>
  );
}
