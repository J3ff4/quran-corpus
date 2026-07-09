'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import type { Word } from '@quran-corpus/data';
import { MorphologySummary } from '../morphology/MorphologySummary';

interface WordPopoverProps {
  word: Word | null;
  gloss?: string;
  glossLang?: string;
  pageLang?: string;
  href?: string;
  onClose: () => void;
}

export function WordPopover({ word, gloss, glossLang, pageLang, href, onClose }: WordPopoverProps) {
  return (
    <AnimatePresence>
      {word && (
        <>
          <motion.div
            data-testid="popover-backdrop"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="word-popover-title"
            tabIndex={-1}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-paper-50 px-6 pb-8 pt-6 shadow-2xl dark:bg-night-200"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {/* Drag handle */}
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-paper-300 dark:bg-night-50" />

            <button
              type="button"
              onClick={onClose}
              className="absolute right-5 top-5 flex h-7 w-7 items-center justify-center rounded-full bg-paper-200 text-paper-500 transition-colors hover:bg-paper-300 dark:bg-night-100 dark:text-paper-400"
              aria-label="Close"
            >
              ✕
            </button>

            {/* Arabic word */}
            <p
              id="word-popover-title"
              dir="rtl"
              className="mb-3 font-arabic text-5xl text-paper-900 dark:text-paper-100"
            >
              {word.text_arabic}
            </p>

            <MorphologySummary word={word} {...(gloss ? { gloss } : {})} />
            {gloss && glossLang && pageLang && glossLang !== pageLang && (
              <span className="ml-1 text-xs text-paper-400" aria-label={`in ${glossLang}`}>
                ({glossLang})
              </span>
            )}

            {href && (
              <Link
                href={href}
                className="mt-5 inline-flex items-center gap-1 rounded-full bg-paper-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-paper-700 dark:bg-paper-100 dark:text-night-200"
              >
                More details →
              </Link>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
