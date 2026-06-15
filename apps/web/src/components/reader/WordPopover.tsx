'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Word } from '@quran-corpus/data';

interface WordPopoverProps {
  word: Word | null;
  gloss?: string;
  onClose: () => void;
}

function parseMorphology(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function WordPopover({ word, gloss, onClose }: WordPopoverProps) {
  const segments = parseMorphology(word?.morphology_json ?? null);

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
              className="mb-1 font-arabic text-5xl text-paper-900 dark:text-paper-100"
            >
              {word.text_arabic}
            </p>

            {/* Transliteration */}
            {word.transliteration && (
              <p className="mb-1 text-lg text-paper-500">{word.transliteration}</p>
            )}

            {/* English gloss */}
            {gloss && (
              <p className="mb-4 text-base text-paper-700 dark:text-paper-300">{gloss}</p>
            )}

            {/* Metadata row */}
            <div className="mb-4 flex flex-wrap gap-2">
              {word.pos_tag && (
                <span className="rounded-full bg-paper-200 px-3 py-0.5 text-sm font-medium text-paper-700 dark:bg-night-100 dark:text-paper-300">
                  {word.pos_tag}
                </span>
              )}
              {word.root && (
                <span className="font-arabic rounded-full bg-paper-200 px-3 py-0.5 text-sm text-paper-700 dark:bg-night-100 dark:text-paper-300">
                  {word.root}
                </span>
              )}
              {word.lemma && (
                <span className="font-arabic rounded-full bg-paper-200 px-3 py-0.5 text-sm text-paper-700 dark:bg-night-100 dark:text-paper-300">
                  {word.lemma}
                </span>
              )}
            </div>

            {/* Morphology segments */}
            {segments.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {segments.map((seg, i) => (
                  <span
                    key={i}
                    className="rounded bg-paper-100 px-2 py-0.5 text-xs text-paper-600 dark:bg-night-100 dark:text-paper-400"
                  >
                    {seg}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
