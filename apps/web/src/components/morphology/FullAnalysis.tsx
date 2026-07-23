'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface FullAnalysisProps {
  description?: string;
  grammarNote?: string;
}

/**
 * Collapsible holding the verbatim scraped morphology prose + Arabic iʿrab.
 * Secondary to the decoded cards; also the graceful display for function words
 * that have no segments. Renders nothing when both fields are absent.
 */
export function FullAnalysis({ description, grammarNote }: FullAnalysisProps) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  if (!description && !grammarNote) return null;

  const body = (
    <div id="full-analysis-body" className="space-y-3 pt-3">
      {description && (
        <p className="text-sm leading-relaxed text-paper-700 dark:text-paper-300">
          {description}
        </p>
      )}
      {grammarNote &&
        grammarNote.split('\n').map((clause, i) => (
          <p
            key={i}
            dir="rtl"
            className="font-arabic text-xl text-paper-800 dark:text-paper-200"
          >
            {clause}
          </p>
        ))}
    </div>
  );

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="full-analysis-body"
        className="flex w-full items-center justify-between rounded-lg text-sm font-semibold uppercase tracking-wide text-paper-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-paper-500"
      >
        <span>Full analysis</span>
        <span aria-hidden className={open ? 'rotate-180 transition-transform' : 'transition-transform'}>
          ▾
        </span>
      </button>

      {reducedMotion ? (
        open && body
      ) : (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="overflow-hidden"
            >
              {body}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </section>
  );
}
