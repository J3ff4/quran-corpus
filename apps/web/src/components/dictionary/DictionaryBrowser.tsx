'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  rootFirstLetter,
  compareRootsArabic,
  foldRootArabic,
  type RootSearchItem,
} from '@quran-corpus/data/client';
import { RootListRow } from './RootListRow';
import { AlphabetGrid } from './AlphabetGrid';
import { TypingText } from '../ui/TypingText';
import { parseSort, type DictionarySort } from '../../app/dictionary/sort';

interface DictionaryBrowserProps {
  roots: RootSearchItem[];
  counts: Record<string, number>;
}

// Rows revealed per page. The filter/sort runs over the full in-memory list;
// only the DOM is paged, so ~1,600 roots don't all mount on every keystroke.
const PAGE = 100;

const toggleBase = 'rounded-full px-4 py-1 text-sm transition-colors';
const toggleActive = 'bg-paper-800 text-paper-50 dark:bg-night-100 dark:text-paper-100';
const toggleIdle = 'text-paper-600 hover:bg-paper-200 dark:text-paper-400 dark:hover:bg-night-100';
const toolLink =
  'rounded-lg border border-paper-300 px-3 py-1.5 text-sm text-paper-700 transition-colors hover:bg-paper-200 dark:border-night-100 dark:text-paper-300 dark:hover:bg-night-100';

/**
 * Dictionary browse surface: search (root + meaning), alpha/freq toggle,
 * letter grid, and rows all operate on the full in-memory root array the
 * static `/dictionary` page ships once — no navigation, no server round-trip.
 * `?q/&sort/&letter` are mirrored into the URL via `history.replaceState`
 * (shareable/bookmarkable) but never pushed/navigated.
 */
export function DictionaryBrowser({ roots, counts }: DictionaryBrowserProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DictionarySort>('alpha');
  const [letter, setLetter] = useState<string | undefined>(undefined);
  const [limit, setLimit] = useState(PAGE);
  // State, not a ref: the URL-sync effect below must not run until the render
  // *after* the URL-read state has committed. A ref flips synchronously, so the
  // sync effect would fire in the same commit with query/sort/letter still at
  // their defaults and write bare '/dictionary', transiently dropping the URL's
  // ?q/&sort/&letter. Gating on this state defers it to the settled render.
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);

  // Read initial state from the URL once, after mount: the static HTML has no
  // query, so the first client render must match it too (no hydration diff);
  // this effect then applies whatever `?q/&sort/&letter` the URL carried.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? '');
    setSort(parseSort(params.get('sort') ?? undefined));
    setLetter(params.get('letter') ?? undefined);
    setHydratedFromUrl(true);
  }, []);

  useEffect(() => {
    if (!hydratedFromUrl) return;
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (sort !== 'alpha') params.set('sort', sort);
    if (letter) params.set('letter', letter);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `/dictionary?${qs}` : '/dictionary');
  }, [hydratedFromUrl, query, sort, letter]);

  // Any change to the filter/sort collapses back to the first page — otherwise
  // a wide reveal would carry over onto a narrower result set.
  useEffect(() => {
    setLimit(PAGE);
  }, [query, sort, letter]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = roots;
    if (letter) list = list.filter((r) => rootFirstLetter(r.root_arabic) === letter);
    if (q) {
      // Arabic arm folds both sides (hamza seat + inter-letter spaces) so `ارض`
      // finds the stored `أرض` — same normalization as server-side searchRoots.
      // Latin arms stay raw: foldRootArabic('ktb') === 'ktb', and a folded Latin
      // needle never occurs inside an Arabic haystack, so folding q is harmless.
      const qf = foldRootArabic(q);
      list = list.filter(
        (r) =>
          foldRootArabic(r.root_arabic).includes(qf) ||
          r.root_buckwalter.toLowerCase().includes(q) ||
          (r.gloss_blob?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) =>
      sort === 'freq'
        ? b.occurrence_count - a.occurrence_count ||
          compareRootsArabic(a.root_arabic, b.root_arabic)
        : compareRootsArabic(a.root_arabic, b.root_arabic),
    );
  }, [roots, query, sort, letter]);

  return (
    <div>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="mb-6 flex gap-2">
        <input
          type="search"
          aria-label="Search roots or meaning"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roots or meaning…"
          className="flex-1 rounded-lg border border-paper-300 bg-paper-50 px-4 py-2 text-paper-900 placeholder:text-paper-400 focus:border-paper-500 focus:outline-none dark:border-night-100 dark:bg-night-50 dark:text-paper-100"
        />
      </form>

      <AlphabetGrid
        counts={counts}
        {...(letter ? { activeLetter: letter } : {})}
        onSelect={(l) => setLetter((prev) => (prev === l ? undefined : l))}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Switching sort clears the letter filter — matches the original
            server-driven behavior (phase-08D spec: sort links omitted
            `letter`), not just a side effect of query-param plumbing. */}
        <button
          type="button"
          onClick={() => {
            setSort('alpha');
            setLetter(undefined);
          }}
          className={`${toggleBase} ${sort === 'alpha' ? toggleActive : toggleIdle}`}
        >
          Alphabetical
        </button>
        <button
          type="button"
          onClick={() => {
            setSort('freq');
            setLetter(undefined);
          }}
          className={`${toggleBase} ${sort === 'freq' ? toggleActive : toggleIdle}`}
        >
          By frequency
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/dictionary/lemma-frequency" className={toolLink}>
          Lemma Frequency
        </Link>
        <Link href="/dictionary/verb-concordance" className={toolLink}>
          Verb Concordance
        </Link>
      </div>

      {query && (
        <h2 className="mb-3 text-sm text-paper-600 dark:text-paper-400">
          Results for “{query}”
        </h2>
      )}

      {visible.length === 0 ? (
        <TypingText text="No roots found." className="px-4 py-8 text-center text-paper-500" />
      ) : (
        <>
          <ul className="divide-y divide-paper-200 dark:divide-night-100">
            {visible.slice(0, limit).map((r) => (
              <li key={r.id}>
                <RootListRow root={r} />
              </li>
            ))}
          </ul>
          {visible.length > limit && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE)}
                className="rounded-lg border border-paper-300 px-5 py-2 text-sm text-paper-700 transition-colors hover:bg-paper-200 dark:border-night-100 dark:text-paper-300 dark:hover:bg-night-100"
              >
                Show more ({visible.length - limit} left)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
