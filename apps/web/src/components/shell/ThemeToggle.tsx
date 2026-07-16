'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type Theme = 'light' | 'dark';

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

function resolveTheme(stored: string | null): Theme {
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Storage unavailable (private mode) — theme applies but won't persist.
  }
}

/**
 * Fixed top-right light/dark toggle, mounted once in the root layout.
 * public/theme-init.js sets the initial `.dark` class before paint; this
 * component re-derives the same value on mount so its icon matches, and
 * follows `storage` events so other open tabs stay in sync.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('theme');
    } catch {
      // Storage unavailable — fall through to the OS preference.
    }
    const initial = resolveTheme(stored);
    document.documentElement.classList.toggle('dark', initial === 'dark');
    setTheme(initial);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'theme') return;
      const next = resolveTheme(e.newValue);
      document.documentElement.classList.toggle('dark', next === 'dark');
      setTheme(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label="Toggle dark mode"
      onClick={toggle}
      className="fixed right-3 top-3 z-30 overflow-hidden rounded-full bg-paper-100/80 p-2 text-paper-600 shadow-sm backdrop-blur transition-colors hover:bg-paper-200 hover:text-paper-900 dark:bg-night-200/80 dark:text-paper-300 dark:hover:bg-night-100 dark:hover:text-paper-100"
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
