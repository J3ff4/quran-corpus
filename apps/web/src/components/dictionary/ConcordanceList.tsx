'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ConcordanceEntry, RootForm } from '@quran-corpus/data/client';
import { trimConcordanceVerse, CONCORDANCE_PAGE_SIZE } from '@quran-corpus/data/client';
import { TypingText } from '../ui/TypingText';
import { verseRef, concordanceHref } from '../../lib/concordance';
import { categorizeFormLabel, formCategoryColor } from '../../lib/formCategoryColor';
import { rootConcordanceEndpoint } from '../../lib/routes';

const PAGE = CONCORDANCE_PAGE_SIZE;

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

/** Small colored tag naming an occurrence's derived form (e.g. "ghafara"),
 *  omitted when the entry has no matching form (form_id null or forms not
 *  supplied by the caller). */
function FormTag({ formId, forms }: { formId: number | null; forms: RootForm[] | undefined }) {
  if (formId === null || !forms) return null;
  const form = forms.find((f) => f.id === formId);
  if (!form) return null;
  const color = formCategoryColor(categorizeFormLabel(form.pos_label));
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {form.form_translit ?? form.pos_label}
    </span>
  );
}

/** Exactly one paging target, enforced by the type: a root page passes
 *  `rootBw` and gets the root URL built for it, a lemma page passes its own
 *  `endpoint`. The `?: never` arms make "both" and "neither" compile errors,
 *  so there is no runtime state where the component cannot page.
 *
 *  Form filtering rides on the `rootBw` arm because only the root endpoint
 *  implements `?forms=`. Passed alongside `endpoint`, `buildUrl` would append
 *  `&forms=…` to `/api/lemma/<bw>/concordance`, which ignores it — returning an
 *  UNFILTERED page and total that the chips would render as though filtered.
 *  Same silent-ignore hazard `LemmaConcordanceOpts = Omit<…,'formIds'>` makes a
 *  compile error in the data layer; this is the UI-side equivalent. */
type ConcordancePagingTarget =
  | {
      /** Buckwalter root — keys the paging API. */
      rootBw: string;
      endpoint?: never;
      /** The root's derived forms, for looking up each entry's form_id -> tag.
       *  Omit to render with no tags (e.g. a root with no forms). */
      forms?: RootForm[];
      /** root_forms.id values to narrow to. Empty/omitted = no filter (unchanged
       *  default behavior, uses initialEntries/total as-is). Changing this value
       *  (a new array reference with different contents) triggers a fresh
       *  offset-0 fetch -- the parent (ConcordanceSection) owns this state. */
      selectedFormIds?: number[];
    }
  | {
      /** Explicit paging endpoint base (e.g. `/api/lemma/qaAla/concordance`). */
      endpoint: string;
      rootBw?: never;
      forms?: never;
      selectedFormIds?: never;
    };

interface ConcordanceListBaseProps {
  /** First page, server-rendered. */
  initialEntries: ConcordanceEntry[];
  /** Total occurrences across the whole concordance (from countRootConcordance). */
  total: number;
}

type ConcordanceListProps = ConcordanceListBaseProps & ConcordancePagingTarget;

/** Occurrence list: verse-ref link, matched form/translit/gloss, and the verse
 * rebuilt word-by-word with the matched word washed. Big roots page in from
 * `/api/roots/<bw>/concordance` on Load-more instead of dumping every verse.
 * When `selectedFormIds` changes to/from a non-empty set, resets to a fresh
 * offset-0 fetch with the new filter; an empty/omitted selection always shows
 * the original unfiltered `initialEntries`/`total` with no extra fetch. */
export function ConcordanceList({
  initialEntries,
  total,
  rootBw,
  endpoint,
  forms,
  selectedFormIds = [],
}: ConcordanceListProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [entriesTotal, setEntriesTotal] = useState(total);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasMore = entries.length < entriesTotal;

  // Abort an in-flight page request if the user navigates away mid-fetch, so
  // its resolution can't fire setState on an unmounted component.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  function buildUrl(offset: number, formIds: number[]): string {
    // Non-null: ConcordancePagingTarget guarantees `rootBw` whenever
    // `endpoint` is absent, but destructuring the union drops that correlation.
    const base = endpoint ?? rootConcordanceEndpoint(rootBw!);
    const withPaging = `${base}?offset=${offset}&limit=${PAGE}`;
    return formIds.length > 0 ? `${withPaging}&forms=${formIds.join(',')}` : withPaging;
  }

  async function fetchPage(offset: number, formIds: number[], replace: boolean) {
    setLoading(true);
    setFailed(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(buildUrl(offset, formIds), { signal: ctrl.signal });
      // A superseding request may have called ctrl.abort() and already moved
      // on by the time this await settles -- re-check before committing
      // anything, since abort() doesn't retroactively unwind an in-flight
      // response that already arrived.
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = (await res.json()) as { entries: ConcordanceEntry[]; total: number };
      if (ctrl.signal.aborted) return;
      setEntries((prev) => (replace ? data.entries : [...prev, ...data.entries]));
      setEntriesTotal(data.total);
    } catch {
      // Abort (unmount, or a newer filter change superseding this one) is
      // expected -- don't surface it, and don't touch state for a stale request.
      if (!ctrl.signal.aborted) setFailed(true);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  function loadMore() {
    if (loading) return;
    void fetchPage(entries.length, selectedFormIds, false);
  }

  // Skip the very first run (the default/unfiltered case is already seeded
  // via initialEntries/total, at zero extra network cost) -- only refetch on
  // a SUBSEQUENT change to the selection.
  const isFirstRun = useRef(true);
  const prevKey = useRef(selectedFormIds.slice().sort().join(','));
  useEffect(() => {
    const key = selectedFormIds.slice().sort().join(',');
    if (isFirstRun.current) {
      isFirstRun.current = false;
      prevKey.current = key;
      return;
    }
    if (key === prevKey.current) return;
    prevKey.current = key;
    abortRef.current?.abort();
    // The abort above skips fetchPage's own `finally` (it bails on
    // ctrl.signal.aborted), so an in-flight request's `loading` would
    // otherwise never clear -- reset it here regardless of which branch runs
    // next (fetchPage below sets it true again immediately if it fetches).
    setLoading(false);
    if (selectedFormIds.length === 0) {
      // Back to "All" -- restore the original unfiltered page, no fetch needed.
      setEntries(initialEntries);
      setEntriesTotal(total);
      setFailed(false);
      return;
    }
    void fetchPage(0, selectedFormIds, true);
    // Deliberately keyed on the sorted+joined content string, not the
    // selectedFormIds array reference -- this project's eslint config has no
    // react-hooks plugin/exhaustive-deps rule to satisfy or suppress.
  }, [selectedFormIds.slice().sort().join(',')]);

  if (entries.length === 0) {
    return <TypingText text="No occurrences." className="px-4 py-6 text-center text-paper-500" />;
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
                <FormTag formId={e.form_id} forms={forms} />
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
