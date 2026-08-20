import Link from 'next/link';
import type { RootEntry as RootEntryT, ConcordanceEntry } from '@quran-corpus/data';
import { ConcordanceSection } from './ConcordanceSection';
import { EntryHeader } from './EntryHeader';
import { ClampedText } from '../ui/ClampedText';
import { rootPath } from '../../lib/routes';
import { definitionSourceLabel } from '@quran-corpus/data/client';

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

/**
 * Full root entry: header, Lane's definition (or an explicit "no entry" note),
 * derived-form filter chips, and the concordance section.
 */
export function RootEntry({ entry, initialConcordance, total, prevBw, nextBw }: RootEntryProps) {
  const { root, forms, definitions } = entry;
  return (
    <article>
      {/* Roots have no transliteration column; the letter pills already spell
          the consonants out, so they take the slot the lemma page gives to a
          Latin reading. */}
      <EntryHeader arabic={root.root_arabic} count={root.occurrence_count}>
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
      </EntryHeader>

      <nav aria-label="Adjacent roots" className="mb-6 flex items-center justify-between">
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

      <section className="mb-8 space-y-3">
        {definitions.length > 0 ? (
          definitions.map((d) => {
            /* An unmapped tag prints as itself, on purpose -- see
               definitionSources for why a visible wrong-looking credit beats a
               silently uncredited one. So a new source needs its SOURCE_LABELS
               entry; nothing here swallows the omission. Null only when the row
               carries no source at all, which the NOT NULL column makes
               unreachable in practice; the clamp toggle then falls back to the
               generic label. */
            const label = definitionSourceLabel(d.source);
            return (
            <div
              key={d.id}
              className="rounded-lg border border-paper-200 bg-paper-100 px-4 py-3 dark:border-night-100 dark:bg-night-50"
            >
              {/* Lane entries run to 1479 characters — a tenth of them past
                  400 — which buried the concordance below several screens of
                  comma-separated senses. Clamped with the rest one tap away. */}
              {/* Named per source: a root with several definitions renders
                  several toggles, and a screen reader listing them cannot tell
                  three identical "Show more lexicon definition" apart. */}
              {/* The credit rides in `footer` so it shares the toggle's row
                  instead of stacking under it. Card interior, so contrast is
                  measured against bg-paper-100 / dark:bg-night-50, not the
                  page: paper-700 6.78:1 and paper-400 6.16:1. paper-500 sat at
                  2.85:1 light / 4.40:1 dark, both under the 4.5:1 WCAG AA floor
                  §8 sets. */}
              <ClampedText
                label={label ? `${label} definition` : 'root definition'}
                className="break-words text-sm leading-relaxed text-paper-800 dark:text-paper-200"
                footer={
                  label && (
                    <span className="text-xs text-paper-700 dark:text-paper-400">{label}</span>
                  )
                }
              >
                {d.definition}
              </ClampedText>
            </div>
            );
          })
        ) : (
          /* An unexplained gap reads as a broken page. 101 of 1642 roots have
             no definition from either source — down from 256 before phase 20
             imported the corpus form glosses — and they are noun-only roots the
             corpus prints a bare `Noun` header for, with no gloss anywhere on
             the page. Upstream absence, not a rendering bug or a parser miss. */
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
              Neither Lane&rsquo;s Lexicon nor the corpus records a meaning for these
              letters.
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
