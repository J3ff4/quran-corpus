import Link from 'next/link';
import { chip } from '../ui/chip';
import type { WbwCell } from './types';

export function WbwWordCell({ cell, pageLang }: { cell: WbwCell; pageLang?: string }) {
  const { surahId, ayahNumber, position, arabic, translit, gloss, glossLang, posLabel } = cell;
  return (
    <Link
      href={`/word/${surahId}/${ayahNumber}/${position}`}
      className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl border border-paper-200 px-3 py-2 text-center transition-colors hover:bg-paper-100 dark:border-night-100 dark:hover:bg-night-200"
    >
      <span className="font-arabic text-2xl leading-[1.8] text-paper-900 dark:text-paper-100" dir="rtl">
        {arabic}
      </span>
      <span className="text-xs text-paper-500 dark:text-paper-400" dir="ltr">{translit ?? '—'}</span>
      <span className="text-xs text-paper-700 dark:text-paper-300" dir="ltr">
        {gloss ?? '—'}
        {gloss && glossLang && pageLang && glossLang !== pageLang && (
          <span className="ml-1 text-paper-400" aria-label={`in ${glossLang}`}>
            ({glossLang})
          </span>
        )}
      </span>
      {posLabel && <span className={chip}>{posLabel}</span>}
    </Link>
  );
}
