import Link from 'next/link';
import type { RootEntry as RootEntryT, ConcordanceEntry } from '@quran-corpus/data';
import { ConcordanceSection } from './ConcordanceSection';
import { ClampedText } from '../ui/ClampedText';
import { rootPath } from '../../lib/routes';

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
 * Full root entry: header, Lane's definition (or an explicit "no entry" note),
 * derived-form filter chips, and the concordance section.
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
              href={rootPath(prevBw)}
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
              href={rootPath(nextBw)}
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

      <section className="mb-8 space-y-3">
        {definitions.length > 0 ? (
          definitions.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border border-paper-200 bg-paper-100 px-4 py-3 dark:border-night-100 dark:bg-night-50"
            >
              {/* Lane entries run to 1479 characters — a tenth of them past
                  400 — which buried the concordance below several screens of
                  comma-separated senses. Clamped to 8 lines with the rest one
                  tap away. */}
              {/* Named per source: a root with several definitions renders
                  several toggles, and a screen reader listing them cannot tell
                  three identical "Show more lexicon definition" apart. */}
              <ClampedText
                label={`${sourceLabel(d.source)} definition`}
                className="break-words text-sm leading-relaxed text-paper-800 dark:text-paper-200"
              >
                {d.definition}
              </ClampedText>
              <p className="mt-2 text-xs text-paper-500">{sourceLabel(d.source)}</p>
            </div>
          ))
        ) : (
          /* An unexplained gap reads as a broken page. 256 of 1642 roots have
             no definition — 141 whose root code is absent from qurandev/roots
             and 115 present but carrying no English gloss upstream (بعث among
             them) — so this is a data gap worth naming, not a rendering bug. */
          <div className="rounded-lg border border-dashed border-paper-200 px-4 py-3 dark:border-night-100">
            {/* Contrast measured against the page backgrounds (bg-paper-50 /
                dark:bg-night-300): paper-700 7.34:1 and paper-300 10.81:1 for
                the message, paper-600 4.73:1 and paper-400 7.62:1 for the
                aside — all past the 4.5:1 WCAG AA floor §8 requires. The
                first drafts (paper-400 at 2.20:1, dark paper-600 at 3.54:1)
                failed it; a message explaining a data gap is exactly the text
                that must stay readable. */}
            <p className="text-sm text-paper-700 dark:text-paper-300">
              No lexicon entry for this root yet.
            </p>
            <p className="mt-1 text-xs text-paper-600 dark:text-paper-400">
              Lane&rsquo;s Lexicon has no meaning recorded for these letters in our source.
            </p>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-paper-600 dark:text-paper-400">
          Concordance ({total})
        </h2>
        <ConcordanceSection
          forms={forms}
          initialConcordance={initialConcordance}
          total={total}
          rootBw={root.root_buckwalter}
        />
      </section>
    </article>
  );
}
