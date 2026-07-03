'use client';

import { useState } from 'react';
import { SearchSheet } from './SearchSheet';

export function SearchTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-paper-800 text-paper-50 shadow-lg dark:bg-night-100 dark:text-paper-100"
      >
        🔍
      </button>
      <SearchSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
