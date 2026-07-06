'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EMPTY_SEARCH_RESULT, type SearchResult } from '@quran-corpus/data/client';
import { SearchResults } from './SearchResults';
import { VersePicker } from '../wbw/VersePicker';
import type { PickerSurah } from '../wbw/types';

export function SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [result, setResult] = useState<SearchResult>(EMPTY_SEARCH_RESULT);
  const [surahs, setSurahs] = useState<PickerSurah[] | null>(null);
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy-load the surah list the first time the sheet opens (cached after).
  useEffect(() => {
    if (!open || surahs !== null) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/surahs', { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as PickerSurah[];
        setSurahs(data);
      } catch {
        // Network/DB error or abort — picker stays hidden, search still works.
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, [open, surahs]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length === 0) {
      setResult(EMPTY_SEARCH_RESULT);
      return;
    }
    const ctrl = new AbortController();
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        setResult((await res.json()) as SearchResult);
      } catch {
        // Aborted (superseded by a newer query) or network error — the stale
        // response is intentionally dropped so results can't land out of order.
      }
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      ctrl.abort();
    };
  }, [q]);

  // Esc closes the sheet while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-paper-50 p-4 dark:bg-night-300"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {surahs && (
              <div className="mb-4 border-b border-paper-200 pb-4 dark:border-night-100">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-paper-500 dark:text-paper-400">
                  Go to verse
                </p>
                <VersePicker surahs={surahs} />
              </div>
            )}
            <div className="mb-4 flex items-center gap-2">
              <input
                type="search"
                autoFocus
                aria-label="Search the Quran"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Verse, Arabic, meaning, or word…"
                className="flex-1 rounded-lg border border-paper-300 bg-paper-50 px-4 py-2 focus:outline-none dark:border-night-100 dark:bg-night-50"
              />
              <button type="button" aria-label="Close search" onClick={onClose} className="px-2 text-paper-500">
                ✕
              </button>
            </div>
            {q.trim().length > 0 && <SearchResults result={result} />}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
