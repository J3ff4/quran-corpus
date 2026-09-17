import { WbwWordRow } from './WbwWordRow';
import { groupByGloss } from './glossGroups';
import type { WbwAyah } from './types';
import { AyahMedallion } from '../reader/ornaments/AyahMedallion';
import { BookmarkButton } from '../shared/BookmarkButton';
import { isSajdahAyah } from '@quran-corpus/data/client';
import { SajdahMark } from '../reader/ornaments/SajdahMark';

export function WbwAyahListBlock({
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
    <section
      id={`ayah-${ayah.ayahNumber}`}
      className="scroll-mt-20 border-b border-paper-200 py-5 dark:border-night-100"
    >
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
        <div className="overflow-x-auto">
          <table aria-label={`Ayah ${ayah.ayahNumber} words`} className="w-full text-left">
            <caption className="sr-only">{`Ayah ${ayah.ayahNumber} word-by-word`}</caption>
            <thead>
              <tr className="border-b border-paper-200 text-xs uppercase tracking-wide text-paper-500 dark:border-night-100">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Translation
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Arabic word
                </th>
                <th scope="col" className="py-2 pl-3 font-medium">
                  Syntax and morphology
                </th>
              </tr>
            </thead>
            <tbody>
              {groupByGloss(ayah.cells).flatMap((group) =>
                group.map((cell, j) => (
                  <WbwWordRow
                    key={cell.position}
                    cell={cell}
                    // The first row of a span owns the translation cell and
                    // spans it down the rest; the rest render none at all.
                    glossSpan={j === 0 ? group.length : 0}
                    {...(pageLang ? { pageLang } : {})}
                    {...(cell.position === ayah.cells[ayah.cells.length - 1]!.position &&
                    isSajdahAyah(ayah.textUthmani)
                      ? { trailingMark: <SajdahMark className="ml-1" /> }
                      : {})}
                  />
                )),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="font-arabic text-2xl leading-[2.4] text-paper-900 dark:text-paper-100" dir="rtl">
          {ayah.textUthmani}
        </p>
      )}
    </section>
  );
}
