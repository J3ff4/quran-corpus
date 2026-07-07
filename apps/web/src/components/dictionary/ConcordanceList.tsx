'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ConcordanceEntry } from '@quran-corpus/data';
import { trimConcordanceVerse } from '@quran-corpus/data/client';
import { verseRef, concordanceHref } from '../../lib/concordance';

const PAGE = 20;

const wash =
  'rounded-md bg-accent-100 px-1 font-semibold text-accent-700 dark:bg-accent-900/40 dark:text-accent-300';

/** One occurrence's verse, trimmed to a window around the matched word by
 * default with a per-row toggle to reveal the whole ayah. */
function ConcordanceVerse({ entry }: { entry: ConcordanceEntry }) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = trimConcordanceVerse(entry.verse_words, entry.word_id);
  const shown = expanded ? entry.verse_words : trimmed.words;
  const canExpand = trimmed.words.length < entry.verse_words.length;
  return (
    <>
      <p dir="rtl" className="font-arabic text-lg leading-loose text-paper-800 dark:text-paper-200">
        {!expanded && trimmed.truncatedBefore && <span className="text-paper-400">… </span>}
        {shown.map((w, i) => (
          <span key={w.id}>
            {i > 0 && ' '}
            <span className={w.id === entry.word_id ? wash : undefined}>{w.text_arabic}</span>
          </span>
        ))}
        {!expanded && trimmed.truncatedAfter && <span className="text-paper-400"> …</span>}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-xs text-paper-500 underline-offset-2 hover:underline"
        >
          {expanded ? 'Show less' : 'Show full verse'}
        </button>
      )}
    </>
  );
}

interface ConcordanceListProps {
  /** First page, server-rendered. */
  initialEntries: ConcordanceEntry[];
  /** Total occurrences across the whole concordance (from countRootConcordance). */
  total: number;
  /** Buckwalter root — keys the paging API. */
  rootBw: string;
}

/** Occurrence list: verse-ref link, matched form/translit/gloss, and the verse
 * rebuilt word-by-word with the matched word washed. Big roots page in from
 * `/api/roots/<bw>/concordance` on Load-more instead of dumping every verse. */
export function ConcordanceList({ initialEntries, total, rootBw }: ConcordanceListProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasMore = entries.length < total;

  // Abort an in-flight page request if the user navigates away mid-fetch, so
  // its resolution can't fire setState on an unmounted component.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(
        `/api/roots/${encodeURIComponent(rootBw)}/concordance?offset=${entries.length}&limit=${PAGE}`,
        { signal: ctrl.signal },
      );
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = (await res.json()) as { entries: ConcordanceEntry[]; total: number };
      setEntries((prev) => [...prev, ...data.entries]);
    } catch {
      // Abort on unmount is expected — don't surface it (and don't setState).
      if (!ctrl.signal.aborted) setFailed(true);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  if (entries.length === 0) {
    return <p className="px-4 py-6 text-center text-paper-500">No occurrences.</p>;
  }

  return (
    <>
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
            <ConcordanceVerse entry={e} />
          </li>
        ))}
      </ul>
      {failed && (
        <p role="alert" className="mt-4 text-center text-sm text-red-600 dark:text-red-400">
          Couldn’t load more. Tap “Load more” to try again.
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mx-auto mt-4 block rounded-full bg-paper-200 px-6 py-2 text-sm text-paper-700 transition-colors hover:bg-paper-300 disabled:opacity-60 dark:bg-night-100 dark:text-paper-300 dark:hover:bg-night-200"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
