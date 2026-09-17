import { WbwWordCell } from './WbwWordCell';
import { WbwGlossSpan } from './WbwGlossSpan';
import { groupByGloss } from './glossGroups';
import type { WbwAyah } from './types';
import { AyahMedallion } from '../reader/ornaments/AyahMedallion';
import { BookmarkButton } from '../shared/BookmarkButton';
import { isSajdahAyah } from '@quran-corpus/data/client';
import { SajdahMark } from '../reader/ornaments/SajdahMark';

export function WbwAyahBlock({
  surahId,
  ayah,
  pageLang,
  bookmarked,
}: {
  surahId: number;
  ayah: WbwAyah;
  pageLang?: string;
  bookmarked: boolean;
}) {
  return (
    <section id={`ayah-${ayah.ayahNumber}`} className="scroll-mt-20 border-b border-paper-200 py-5 dark:border-night-100">
      <div className="mb-3 flex items-center gap-2">
        <AyahMedallion n={ayah.ayahNumber} />
        <BookmarkButton
          surahId={surahId}
          ayahNumber={ayah.ayahNumber}
          view="wbw"
          initialBookmarked={bookmarked}
        />
      </div>
      {ayah.cells.length > 0 ? (
        <div className="flex flex-wrap gap-2" dir="rtl">
          {groupByGloss(ayah.cells).map((group) =>
            group.length === 1 ? (
              <WbwWordCell
                key={group[0]!.position}
                cell={group[0]!}
                {...(pageLang ? { pageLang } : {})}
              />
            ) : (
              <WbwGlossSpan
                key={group[0]!.position}
                cells={group}
                {...(pageLang ? { pageLang } : {})}
              />
            ),
          )}
          {isSajdahAyah(ayah.textUthmani) && <SajdahMark />}
        </div>
      ) : (
        <p className="font-arabic text-2xl leading-[2.4] text-paper-900 dark:text-paper-100" dir="rtl">
          {ayah.textUthmani}
        </p>
      )}
    </section>
  );
}
