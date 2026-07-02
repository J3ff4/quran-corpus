import Link from 'next/link';
import type { ConcordanceEntry } from '@quran-corpus/data';
import { verseRef, concordanceHref } from '../../lib/concordance';

interface ConcordanceListProps {
  entries: ConcordanceEntry[];
}

/** Occurrence list: verse-ref link → word detail, form, translit, gloss, verse. */
export function ConcordanceList({ entries }: ConcordanceListProps) {
  if (entries.length === 0) {
    return <p className="px-4 py-6 text-center text-paper-500">No occurrences.</p>;
  }
  return (
    <ul className="divide-y divide-paper-200 dark:divide-night-100">
      {entries.map((e) => (
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
          <p dir="rtl" className="font-arabic text-lg leading-loose text-paper-800 dark:text-paper-200">
            {e.verse_text}
          </p>
        </li>
      ))}
    </ul>
  );
}
