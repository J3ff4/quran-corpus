import Link from 'next/link';
import type { LemmaEntry as LemmaEntryT, ConcordanceEntry } from '@quran-corpus/data';
import { posLabelEn } from '@quran-corpus/data';
import { ConcordanceList } from './ConcordanceList';
import { rootPath, lemmaConcordanceEndpoint } from '../../lib/routes';

interface LemmaEntryProps {
  entry: LemmaEntryT;
  /** First page of the concordance; the rest is paged in client-side. */
  initialConcordance: ConcordanceEntry[];
  /** Total occurrences across the whole concordance. */
  total: number;
}

/**
 * Full lemma entry: header, quick meaning (additive — omitted when empty),
 * root definition with an up-link to the root page (omitted when rootless),
 * and the concordance section. Server component; ConcordanceList inside is
 * `'use client'` but that's fine as a child.
 */
export function LemmaEntry({ entry, initialConcordance, total }: LemmaEntryProps) {
  return (
    <article>
      <header className="mb-6">
        <h1 dir="rtl" className="font-arabic text-4xl text-paper-900 dark:text-paper-100">
          {entry.lemma}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-paper-500">
          {entry.transliteration && <span>{entry.transliteration}</span>}
          {/* Human label, not the raw corpus code: the word-by-word page already
              renders this tag through posLabelEn, so `REL` here and
              "relative pronoun" there would be the same tag reading two ways. */}
          {entry.pos_tag && <span>{posLabelEn(entry.pos_tag)}</span>}
          <span>
            occurs {entry.count} time{entry.count === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      {entry.top_gloss && (
        <section className="mb-6">
          <p className="text-base text-paper-800 dark:text-paper-200">{entry.top_gloss}</p>
        </section>
      )}

      {entry.root_buckwalter && (
        <section className="mb-8 space-y-3">
          <div className="rounded-lg border border-paper-200 bg-paper-100 px-4 py-3 dark:border-night-100 dark:bg-night-50">
            {/* Only label the box "Definition of root" when there is a
                definition to show; a rooted lemma whose root has no
                root_definitions row would otherwise render a titled but empty
                box. The View-root link is always useful, so it stays. */}
            {entry.root_definition && (
              <>
                <p className="mb-1 text-xs font-medium text-paper-500">Definition of root</p>
                <p className="break-words text-sm leading-relaxed text-paper-800 dark:text-paper-200">
                  {entry.root_definition}
                </p>
              </>
            )}
            <Link
              href={rootPath(entry.root_buckwalter)}
              className={`inline-block text-xs text-accent-700 underline-offset-2 hover:underline dark:text-accent-300${
                entry.root_definition ? ' mt-2' : ''
              }`}
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
