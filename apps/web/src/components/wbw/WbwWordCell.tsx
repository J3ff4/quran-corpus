import Link from 'next/link';
import { SegmentPills } from '../morphology/SegmentPills';
import type { WbwCell } from './types';

export function WbwWordCell({ cell, pageLang }: { cell: WbwCell; pageLang?: string }) {
  const { surahId, ayahNumber, position, arabic, translit, gloss, glossLang, segments } = cell;
  return (
    <Link
      href={`/word/${surahId}/${ayahNumber}/${position}`}
      className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl border border-paper-200 px-3 py-2 text-center transition-colors hover:bg-paper-100 dark:border-night-100 dark:hover:bg-night-200"
    >
      <SegmentPills segments={segments} fallbackWord={arabic} />
      <span className="text-xs text-paper-500 dark:text-paper-400" dir="ltr">{translit ?? '—'}</span>
      <span className="text-xs text-paper-700 dark:text-paper-300" dir="ltr">
        {gloss ?? '—'}
        {gloss && glossLang && pageLang && glossLang !== pageLang && (
          <span className="ml-1 text-paper-400" aria-label={`in ${glossLang}`}>
            ({glossLang})
          </span>
        )}
      </span>
    </Link>
  );
}
