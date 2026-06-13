import type { Word } from '@quran-corpus/data';

interface WordTokenProps {
  word: Word;
  onClick: (word: Word) => void;
}

export function WordToken({ word, onClick }: WordTokenProps) {
  return (
    <button
      type="button"
      aria-label={`Word: ${word.transliteration ?? word.text_arabic}, position ${word.position}`}
      onClick={() => onClick(word)}
      className="cursor-pointer rounded px-0.5 leading-loose transition-colors hover:bg-paper-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-paper-500 dark:hover:bg-night-100"
    >
      {word.text_arabic}
    </button>
  );
}
