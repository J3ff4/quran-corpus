import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { Bismillah } from '../reader/ornaments/Bismillah';
import { SurahFrame } from '../reader/ornaments/SurahFrame';
import { surahNameGlyph } from '../reader/ornaments/surahNameGlyph';
import { WbwAyahs } from './WbwAyahs';
import { Pager } from './Pager';
import { ScrollToAyah } from '../shared/ScrollToAyah';
import { VersePicker } from './VersePicker';
import type { ViewMode } from './ViewToggle';
import type { WbwAyah, PickerSurah } from './types';

interface WbwViewProps {
  surah: Surah;
  ayahs: WbwAyah[];
  page: number;
  totalPages: number;
  scrollAyah: number | null;
  pageLang?: string;
  pickerSurahs?: PickerSurah[];
  initialViewMode?: ViewMode;
}

export function WbwView({
  surah,
  ayahs,
  page,
  totalPages,
  scrollAyah,
  pageLang,
  pickerSurahs = [],
  initialViewMode = 'card',
}: WbwViewProps) {
  return (
    <div>
      <header className="mb-4 text-center">
        <SurahFrame surahNumber={surah.id}>
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

      {pickerSurahs.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-paper-500 dark:text-paper-400">
            Go to verse
          </h2>
          <VersePicker surahs={pickerSurahs} />
        </section>
      )}

      {page === 1 && <Bismillah surahId={surah.id} />}

      <WbwAyahs
        surahId={surah.id}
        ayahs={ayahs}
        initialViewMode={initialViewMode}
        {...(pageLang ? { pageLang } : {})}
      />

      <Pager surahId={surah.id} page={page} totalPages={totalPages} />
      {scrollAyah != null && <ScrollToAyah ayah={scrollAyah} />}
    </div>
  );
}
