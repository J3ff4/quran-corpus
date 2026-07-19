'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSearch } from '../search/SearchProvider';
import { ThemeToggle } from './ThemeToggle';

const ROW =
  'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-paper-700 transition-colors hover:bg-paper-100 dark:text-paper-300 dark:hover:bg-night-200';
const ICON = 'h-5 w-5 shrink-0';

const searchIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const bookmarkIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1z" />
  </svg>
);

const infoIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5v.01" />
  </svg>
);

const frequencyIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 20V12M12 20V6M19 20v-5" />
  </svg>
);

const concordanceIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6h16M4 12h10M4 18h13" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export function DrawerMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { open: openSearch } = useSearch();
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Move focus into the panel on open, restore it to whatever triggered the
  // drawer (the Menu button) on close. Separate from the keydown effect below
  // so a re-render that recreates `onClose` (BottomNav doesn't memoize it)
  // can't re-fire this and bounce focus in and out while the drawer is open.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
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
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-y-0 right-0 z-50 w-72 max-w-[80vw] overflow-y-auto bg-paper-50 p-3 pt-[calc(1rem+env(safe-area-inset-top))] dark:bg-night-300"
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="mb-2 flex items-center justify-between">
              <ThemeToggle />
              <button
                ref={closeBtnRef}
                type="button"
                aria-label="Close menu"
                onClick={onClose}
                className="px-2 py-1 text-paper-500"
              >
                ✕
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                openSearch();
              }}
              className={ROW}
            >
              {searchIcon}
              <span>Search</span>
            </button>

            <Link href="/bookmarks" onClick={onClose} className={ROW}>
              {bookmarkIcon}
              <span>Bookmarks</span>
            </Link>

            <Link href="/dictionary/lemma-frequency" onClick={onClose} className={ROW}>
              {frequencyIcon}
              <span>Lemma Frequency</span>
            </Link>

            <Link href="/dictionary/verb-concordance" onClick={onClose} className={ROW}>
              {concordanceIcon}
              <span>Verb Concordance</span>
            </Link>

            <Link href="/about" onClick={onClose} className={ROW}>
              {infoIcon}
              <span>About &amp; Credits</span>
            </Link>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
