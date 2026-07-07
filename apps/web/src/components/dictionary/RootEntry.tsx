import Link from 'next/link';
import type { RootEntry as RootEntryT, ConcordanceEntry } from '@quran-corpus/data';
import { FormGroup } from './FormGroup';
import { ConcordanceList } from './ConcordanceList';

interface RootEntryProps {
  entry: RootEntryT;
  /** First page of the concordance; the rest is paged in client-side. */
  initialConcordance: ConcordanceEntry[];
  /** Total occurrences across the whole concordance. */
  total: number;
  /** Hijāʾī-adjacent roots for prev/next nav; null at the list ends. */
  prevBw: string | null;
  nextBw: string | null;
}

const sourceLabel = (source: string): string =>
  source === 'lane' || source === 'qurandev-lane' ? "Lane's Lexicon" : source;

/**
 * Full root entry: header, Lane's definition (additive — omitted when empty),
 * derived form groups, and the concordance section.
 */
export function RootEntry({ entry, initialConcordance, total, prevBw, nextBw }: RootEntryProps) {
  const { root, forms, definitions } = entry;
  return (
    <article>
      <header className="mb-6">
        <h1
          dir="rtl"
          className="font-arabic text-4xl text-paper-900 dark:text-paper-100"
        >
          {root.root_arabic}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <span dir="rtl" className="flex gap-1.5">
            {Array.from(root.root_arabic.replace(/\s+/g, '')).map((letter, i) => (
              <span
                key={i}
                className="font-arabic rounded-md bg-paper-200 px-2.5 py-1 text-lg text-paper-800 dark:bg-night-100 dark:text-paper-200"
              >
                {letter}
              </span>
            ))}
          </span>
          <span className="text-sm text-paper-500">
            occurs {root.occurrence_count} time{root.occurrence_count === 1 ? '' : 's'}
          </span>
        </div>
        <nav aria-label="Adjacent roots" className="mt-4 flex items-center justify-between">
          {prevBw ? (
            <Link
              href={`/dictionary/${encodeURIComponent(prevBw)}`}
              aria-label="Previous root"
              className="rounded-lg border border-paper-300 px-3 py-1.5 text-sm text-paper-700 transition-colors hover:bg-paper-200 dark:border-night-100 dark:text-paper-300 dark:hover:bg-night-100"
            >
              ← Previous
            </Link>
          ) : (
            <span
              aria-label="Previous root"
              aria-disabled="true"
              className="rounded-lg border border-paper-200 px-3 py-1.5 text-sm text-paper-300 dark:border-night-50 dark:text-paper-600"
            >
              ← Previous
            </span>
          )}
          {nextBw ? (
            <Link
              href={`/dictionary/${encodeURIComponent(nextBw)}`}
              aria-label="Next root"
              className="rounded-lg border border-paper-300 px-3 py-1.5 text-sm text-paper-700 transition-colors hover:bg-paper-200 dark:border-night-100 dark:text-paper-300 dark:hover:bg-night-100"
            >
              Next →
            </Link>
          ) : (
            <span
              aria-label="Next root"
              aria-disabled="true"
              className="rounded-lg border border-paper-200 px-3 py-1.5 text-sm text-paper-300 dark:border-night-50 dark:text-paper-600"
            >
              Next →
            </span>
          )}
        </nav>
      </header>

      {definitions.length > 0 && (
        <section className="mb-8 space-y-3">
          {definitions.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border border-paper-200 bg-paper-100 px-4 py-3 dark:border-night-100 dark:bg-night-50"
            >
              <p className="text-sm leading-relaxed text-paper-800 dark:text-paper-200">
                {d.definition}
              </p>
              <p className="mt-2 text-xs text-paper-500">{sourceLabel(d.source)}</p>
            </div>
          ))}
        </section>
      )}

      {forms.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-paper-600 dark:text-paper-400">
            Derived forms
          </h2>
          <div className="divide-y divide-paper-200 dark:divide-night-100">
            {forms.map((f) => (
              <FormGroup key={f.id} form={f} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-paper-600 dark:text-paper-400">
          Concordance ({total})
        </h2>
        <ConcordanceList
          initialEntries={initialConcordance}
          total={total}
          rootBw={root.root_buckwalter}
        />
      </section>
    </article>
  );
}
