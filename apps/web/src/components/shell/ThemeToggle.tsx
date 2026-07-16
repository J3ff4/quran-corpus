'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: sunIcon },
  { value: 'dark', label: 'Dark', icon: moonIcon },
];

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
 * Fixed top-right light/dark dropdown, mounted once in the root layout.
 * public/theme-init.js sets the initial `.dark` class before paint; this
 * component re-derives the same value on mount so its icon matches, and
 * follows `storage` events so other open tabs stay in sync.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  // Menu-button keyboard contract: focus moves into the menu on open (to the
  // checked item), arrows/Home/End navigate, Escape closes back to trigger.
  useEffect(() => {
    if (!open) return;
    const checked = OPTIONS.findIndex((o) => o.value === theme);
    itemRefs.current[checked === -1 ? 0 : checked]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // theme is read only for the focus target at open time; the menu closes on
    // every selection, so re-running on theme change is unnecessary.
  }, [open]);

  const onMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => el != null);
    if (items.length === 0) return;
    const idx = items.findIndex((el) => el === document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      items[(idx + delta + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }, []);

  const onTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  }, []);

  const select = useCallback((t: Theme) => {
    applyTheme(t);
    setTheme(t);
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <div ref={rootRef} className="fixed right-3 top-3 z-30">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="theme-menu"
        aria-label="Theme"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className="rounded-full bg-paper-100/80 p-2 text-paper-600 shadow-sm backdrop-blur transition-colors hover:bg-paper-200 hover:text-paper-900 dark:bg-night-200/80 dark:text-paper-300 dark:hover:bg-night-100 dark:hover:text-paper-100"
      >
        {theme === 'dark' ? moonIcon : sunIcon}
      </button>
      {open && (
        <div
          id="theme-menu"
          role="menu"
          aria-label="Theme"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 mt-2 w-32 overflow-hidden rounded-xl border border-paper-200 bg-paper-50 py-1 shadow-lg dark:border-night-100 dark:bg-night-200"
        >
          {OPTIONS.map((opt, i) => (
            <button
              key={opt.value}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={theme === opt.value}
              tabIndex={-1}
              onClick={() => select(opt.value)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-paper-100 focus:bg-paper-100 focus:outline-none dark:hover:bg-night-100 dark:focus:bg-night-100 ${
                theme === opt.value
                  ? 'font-medium text-paper-900 dark:text-paper-100'
                  : 'text-paper-600 dark:text-paper-300'
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
