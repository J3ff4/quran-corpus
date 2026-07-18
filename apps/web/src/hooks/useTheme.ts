'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

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
 * public/theme-init.js sets the initial `.dark` class before paint; this
 * hook re-derives the same value on mount so callers' UI matches, and
 * follows `storage` events so other open tabs stay in sync.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>('light');

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

  return { theme, toggle };
}
