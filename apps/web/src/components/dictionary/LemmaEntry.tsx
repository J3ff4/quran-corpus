import Link from 'next/link';
import type { LemmaEntry as LemmaEntryT, ConcordanceEntry, LemmaSense } from '@quran-corpus/data';
import { ConcordanceList } from './ConcordanceList';
import { ClampedText } from '../ui/ClampedText';
import { rootPath, lemmaConcordanceEndpoint } from '../../lib/routes';

interface LemmaEntryProps {
  entry: LemmaEntryT;
  /** First page of the concordance; the rest is paged in client-side. */
  initialConcordance: ConcordanceEntry[];
  /** Total occurrences across the whole concordance. */
  total: number;
}

/**
 * The lemma's grammatical senses.
 *
 * A lemma with one sense reads as a plain label ("Verb"). A lemma with several
 * gets each one with its own count, because naming only the commonest is a
 * false statement about the rest: مَا was labelled flatly "Relative pronoun"
 * while 911 of its 2177 occurrences are negative, interrogative, subordinating,
 * conditional or superlative. The counts are the honest version and they also
 * tell the reader why the concordance below is so mixed.
 */
function Senses({ senses }: { senses: LemmaSense[] }) {
  if (senses.length === 0) return null;
  if (senses.length === 1) return <span>{senses[0]!.pos_label}</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {senses.map((s) => (
        <span key={s.pos_tag} className="whitespace-nowrap">
          {s.pos_label}{' '}
          {/* These counts sit on the PAGE background (bg-paper-50), where
              paper-600 measures 4.73:1 and clears the 4.5:1 WCAG AA floor §8
              sets; paper-400 would be 2.20:1 and dark paper-600 3.54:1, both
              failing. Contrast is a function of the background, so this pair
              is only correct while these stay on the page — moved onto a
              paper-100 card, paper-600 drops to 4.38:1 and fails. */}
          <span className="tabular-nums text-paper-600 dark:text-paper-400">{s.count}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * Full lemma entry: header with the sense breakdown, the gloss chips, root
 * definition with an up-link to the root page (omitted when rootless), and the
 * concordance section. Server component; ConcordanceList and ClampedText inside
 * are `'use client'` but that's fine as children.
 */
export function LemmaEntry({ entry, initialConcordance, total }: LemmaEntryProps) {
  return (
    <article>
      <header className="mb-6">
        <h1 dir="rtl" className="font-arabic text-4xl text-paper-900 dark:text-paper-100">
          {entry.lemma}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-paper-500">
          {entry.transliteration && <span>{entry.transliteration}</span>}
          <Senses senses={entry.senses} />
          <span>
            occurs {entry.count} time{entry.count === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      {entry.top_glosses.length > 0 && (
        <section className="mb-6">
          {/* Labelled "Translated as", never "meaning". These are the corpus's
              word-by-word translations of this lemma *in context*, so they
              carry the surrounding sentence with them — the single most
              frequent one for ضرب is "Allah sets forth", which is a clause,
              not a definition. Showing the set makes the range legible instead
              of asserting one contextual phrase as the lemma's meaning. */}
          {/* On the page background, so paper-600/400 (4.73:1 / 7.62:1). The
              heading has to be readable for the caption below to do its job:
              if "Translated as" is illegible the chips read as definitions,
              which is the exact misreading this section exists to prevent.
              paper-500 was 3.08:1 and failed. */}
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-paper-600 dark:text-paper-400">
            Translated as
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {entry.top_glosses.map((g) => (
              <li
                key={g}
                className="rounded-full bg-paper-100 px-2.5 py-1 text-sm text-paper-800 dark:bg-night-50 dark:text-paper-200"
              >
                {g}
              </li>
            ))}
          </ul>
          {/* paper-600/400, not paper-400/600: the latter measures 2.20:1 on
              bg-paper-50 and 3.54:1 on night-300, both under the 4.5:1 AA
              floor. This caption is the whole reason the chips above are not
              read as definitions, so it has to be legible. */}
          <p className="mt-2 text-xs text-paper-600 dark:text-paper-400">
            From word-by-word translations, ordered by frequency — not dictionary definitions.
          </p>
        </section>
      )}

      {entry.root_buckwalter && (
        <section className="mb-8 space-y-3">
          <div className="rounded-lg border border-paper-200 bg-paper-100 px-4 py-3 dark:border-night-100 dark:bg-night-50">
            {/* Card interior, so the background is bg-paper-100 / night-50 —
                one step off the page, and enough to change the answer.
                paper-600 clears AA on the page (4.73:1) but not here (4.38:1);
                paper-700 gives 6.78:1. Mirrored on the dark side: paper-400 is
                6.16:1 on night-50, paper-700 would be 1.84:1. Hence the
                asymmetric pair. paper-500, which this was, is 2.85:1 light and
                4.40:1 dark — failing in both themes. */}
            <p className="mb-1 text-xs font-medium text-paper-700 dark:text-paper-400">
              Definition of root
            </p>
            {entry.root_definition ? (
              <ClampedText
                label="root definition"
                className="break-words text-sm leading-relaxed text-paper-800 dark:text-paper-200"
              >
                {entry.root_definition}
              </ClampedText>
            ) : (
              /* Say the entry is missing rather than rendering an unexplained
                 gap: 256 of 1642 roots have no lexicon definition, all of them
                 upstream gaps in qurandev/roots. Silence here reads as a bug.

                 Same tokens as RootEntry's copy of this message (paper-700/300
                 = 6.78:1 / 8.74:1 on the card), which is both the DRY answer
                 and the accessible one: paper-500 measured 2.85:1 light and
                 4.40:1 dark, so the only text explaining the empty card was
                 the least readable thing in it, in both themes. */
              <p className="text-sm text-paper-700 dark:text-paper-300">
                No lexicon entry for this root yet.
              </p>
            )}
            <Link
              href={rootPath(entry.root_buckwalter)}
              className="mt-2 inline-block text-xs text-accent-700 underline-offset-2 hover:underline dark:text-accent-300"
            >
              View root
            </Link>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-paper-600 dark:text-paper-400">
          Concordance ({total})
        </h2>
        <ConcordanceList
          initialEntries={initialConcordance}
          total={total}
          endpoint={lemmaConcordanceEndpoint(entry.lemma_buckwalter)}
        />
      </section>
    </article>
  );
}
