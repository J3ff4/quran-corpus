import Link from 'next/link';
import { SegmentPills } from '../morphology/SegmentPills';
import type { WbwCell } from './types';

/** One word in the word-by-word grid layout: segment pills stacked over the
 *  transliteration and gloss, the whole card linking to that word's page.
 *  WbwWordRow is the same word in the table layout — the two differ in what
 *  they can afford to show, not in what they mean. */
export function WbwWordCell({ cell, pageLang }: { cell: WbwCell; pageLang?: string }) {
  const { surahId, ayahNumber, position, arabic, translit, gloss, glossLang, segments } = cell;
  return (
    <Link
      href={`/word/${surahId}/${ayahNumber}/${position}`}
      /* Hover darkens the border, not the fill. The POS pills inside are
         `color-mix(… 16%, transparent)`, so any background behind them
         composites into their own contrast: filling the cell with paper-100
         on hover dropped every pill label from ~4.6:1 to ~4.3:1, under the AA
         text floor the palette is calibrated for, in the exact interaction
         used to pick a word. A border carries the same affordance and sits
         outside the pills entirely.

         The hover colour is ONE token in both themes. The border has to clear
         the 3:1 non-text floor against the page it sits on, and the page is
         paper-50 in one theme and night-300 in the other -- only two steps of
         the ramp clear it both ways, paper-500 (3.08:1 light / 5.44:1 dark)
         and paper-600 (4.73:1 / 3.54:1). paper-600 wins on the worse of its
         two sides, 3.54:1 against paper-500's 3.08:1; both are legal, so
         either is defensible and this one is the safer margin. Everything
         darker or lighter fails one side outright -- paper-400 is 2.20:1 on
         the light page, paper-700 2.28:1 on the dark one.

         `dark:hover:` still has to be spelled out even though the colour is
         the same, and that is a cascade fact, not a palette one. Tailwind
         emits `.dark\:border-night-100:is(.dark *)` AFTER
         `.hover\:border-paper-600:hover`, and `:is(.dark *)` scores as a
         single class, so the two tie at (0,2,0) and the resting dark border
         wins on order -- hovering in dark mode changed nothing at all. The
         `dark:hover:` rule sorts after both. */
      className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl border border-paper-200 px-3 py-2 text-center transition-colors hover:border-paper-600 dark:border-night-100 dark:hover:border-paper-600"
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
