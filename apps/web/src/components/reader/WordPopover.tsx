'use client';

import type { Word } from '@quran-corpus/data';

interface WordPopoverProps {
  word: Word | null;
  onClose: () => void;
}

export function WordPopover({ word, onClose }: WordPopoverProps) {
  if (!word) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-paper-50 p-6 shadow-xl dark:bg-night-200"
    >
      <button
        onClick={onClose}
        className="absolute right-5 top-5 text-paper-400"
        aria-label="Close"
      >
        ✕
      </button>
      <p className="font-arabic text-5xl text-right">{word.text_arabic}</p>
    </div>
  );
}
