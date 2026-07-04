'use client';

import Link from 'next/link';
import type { ConcordanceEntry } from '@quran-corpus/data';
import { verseRef, concordanceHref } from '../../lib/concordance';
import { useIncrementalReveal } from '../../hooks/useIncrementalReveal';

// Reuse the 08c reveal tuning: long concordances mount INITIAL, reveal STEP.
const THRESHOLD = 40;
const INITIAL = 20;
const STEP = 20;

const wash =
  'rounded-md bg-accent-100 px-1 font-semibold text-accent-700 dark:bg-accent-900/40 dark:text-accent-300';

interface ConcordanceListProps {
  entries: ConcordanceEntry[];
}

/** Occurrence list: verse-ref link, matched form/translit/gloss, and the verse
 * rebuilt word-by-word from `verse_words` with the matched word washed. Long
 * lists reveal incrementally (reuses useIncrementalReveal). */
export function ConcordanceList({ entries }: ConcordanceListProps) {
  const paginate = entries.length > THRESHOLD;
  const { visibleCount, sentinelRef, done, revealTo } = useIncrementalReveal<HTMLButtonElement>(
    entries.length,
    INITIAL,
    STEP,
  );

  if (entries.length === 0) {
    return <p className="px-4 py-6 text-center text-paper-500">No occurrences.</p>;
  }

  const visible = paginate ? entries.slice(0, visibleCount) : entries;
  return (
    <>
      <ul className="divide-y divide-paper-200 dark:divide-night-100">
        {visible.map((e) => (
          <li key={e.word_id} className="py-3">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <Link
                href={concordanceHref(e)}
                className="text-sm font-medium text-paper-600 underline-offset-2 hover:underline dark:text-paper-400"
              >
                {verseRef(e)}
              </Link>
              <span className="flex items-baseline gap-2">
                <span dir="rtl" className="font-arabic text-lg text-paper-900 dark:text-paper-100">
                  {e.text_arabic}
                </span>
                {e.transliteration && (
                  <span className="text-xs text-paper-500">{e.transliteration}</span>
                )}
              </span>
            </div>
            {e.gloss && (
              <p className="mb-1 text-sm text-paper-700 dark:text-paper-300">{e.gloss}</p>
            )}
            <p
              dir="rtl"
              className="font-arabic text-lg leading-loose text-paper-800 dark:text-paper-200"
            >
              {e.verse_words.map((w, i) => (
                <span key={w.id}>
                  {i > 0 && ' '}
                  <span className={w.id === e.word_id ? wash : undefined}>{w.text_arabic}</span>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
      {paginate && !done && (
        <button
          ref={sentinelRef}
          type="button"
          onClick={() => revealTo(visibleCount + STEP)}
          className="mx-auto mt-4 block rounded-full bg-paper-200 px-6 py-2 text-sm text-paper-700 transition-colors hover:bg-paper-300 dark:bg-night-100 dark:text-paper-300 dark:hover:bg-night-200"
        >
          Load more
        </button>
      )}
    </>
  );
}
