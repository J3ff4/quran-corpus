import Link from 'next/link';
import type { ReactNode } from 'react';
import { SegmentPills } from '../morphology/SegmentPills';
import type { WbwCell } from './types';

export function WbwWordRow({
  cell,
  pageLang,
  trailingMark,
}: {
  cell: WbwCell;
  pageLang?: string;
  trailingMark?: ReactNode;
}) {
  const {
    surahId,
    ayahNumber,
    position,
    arabic,
    translit,
    gloss,
    glossLang,
    segments,
    morphologyDescription,
    grammarArabic,
  } = cell;

  return (
    <tr className="border-b border-paper-100 align-top dark:border-night-50">
      <td className="py-3 pr-3">
        <div className="text-sm text-paper-900 dark:text-paper-100" dir="ltr">
          {gloss ?? '—'}
          {gloss && glossLang && pageLang && glossLang !== pageLang && (
            <span className="ml-1 text-paper-400" aria-label={`in ${glossLang}`}>
              ({glossLang})
            </span>
          )}
        </div>
        <div className="text-xs text-paper-500 dark:text-paper-400" dir="ltr">
          {translit ?? '—'}
        </div>
        <div className="text-xs text-paper-400 tabular-nums">{`(${surahId}:${ayahNumber}:${position})`}</div>
      </td>
      <td className="px-3 py-3 text-center">
        <Link
          href={`/word/${surahId}/${ayahNumber}/${position}`}
          className="inline-flex flex-col items-center gap-1 hover:opacity-80"
        >
          <SegmentPills segments={segments} fallbackWord={arabic} />
        </Link>
        {trailingMark}
      </td>
      <td className="py-3 pl-3 text-sm text-paper-700 dark:text-paper-300">
        <div>{morphologyDescription ?? '—'}</div>
        <div className="font-arabic text-base text-paper-600 dark:text-paper-400" dir="rtl">
          {grammarArabic ?? '—'}
        </div>
      </td>
    </tr>
  );
}
