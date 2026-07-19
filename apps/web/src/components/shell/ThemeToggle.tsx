'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTheme } from '../../hooks/useTheme';

const sunIcon = (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const moonIcon = (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

/**
 * Light/dark icon-morph toggle -- a self-contained pill button meant to be
 * placed by its caller (top-left of the drawer menu panel), not fixed to
 * the viewport itself. Icon rotates+crossfades on toggle (skipped under
 * prefers-reduced-motion). Theme state lives in useTheme() (shared with
 * anywhere else that needs it) so this component owns only the button
 * chrome and animation.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label="Toggle dark mode"
      onClick={toggle}
      className="overflow-hidden rounded-full bg-paper-100/80 p-2 text-paper-600 shadow-sm backdrop-blur transition-colors hover:bg-paper-200 hover:text-paper-900 dark:bg-night-200/80 dark:text-paper-300 dark:hover:bg-night-100 dark:hover:text-paper-100"
    >
      {reducedMotion ? (
        <span className="block h-5 w-5">{theme === 'dark' ? moonIcon : sunIcon}</span>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            className="block h-5 w-5"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            {theme === 'dark' ? moonIcon : sunIcon}
          </motion.span>
        </AnimatePresence>
      )}
    </button>
  );
}
