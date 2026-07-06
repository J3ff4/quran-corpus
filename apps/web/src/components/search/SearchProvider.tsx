'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { SearchSheet } from './SearchSheet';

interface SearchContextValue {
  /** Open the single shared search sheet. */
  open: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

/** Access the shared search sheet. Must be used inside {@link SearchProvider}. */
export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used within SearchProvider');
  return ctx;
}

/**
 * Owns the one canonical search surface for the whole app. Any trigger
 * (bottom-nav button, home box) calls `useSearch().open()`; the sheet is
 * mounted here exactly once so there is a single search UI, not one per page.
 */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SearchContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <SearchSheet open={open} onClose={() => setOpen(false)} />
    </SearchContext.Provider>
  );
}
