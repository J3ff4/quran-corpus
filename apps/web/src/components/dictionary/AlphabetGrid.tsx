import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data/client';

interface AlphabetGridProps {
  counts: Record<string, number>;
  activeLetter?: string;
  onSelect: (letter: string) => void;
}

const base =
  'flex h-9 w-9 items-center justify-center rounded-md font-arabic text-lg transition-colors';
const active = 'bg-accent-500 text-paper-50';
const idle =
  'bg-paper-200 text-paper-800 hover:bg-paper-300 dark:bg-night-100 dark:text-paper-200 dark:hover:bg-night-200';
const off = 'cursor-default bg-paper-100 text-paper-300 dark:bg-night-50 dark:text-paper-600';

/**
 * Arabic letter picker. Present letters are buttons calling `onSelect`
 * (parent owns the toggle-off-if-already-active behavior); empty letters
 * render disabled. Client-state only — no navigation.
 */
export function AlphabetGrid({ counts, activeLetter, onSelect }: AlphabetGridProps) {
  return (
    <nav dir="rtl" aria-label="Filter roots by letter" className="mb-6 flex flex-wrap gap-1.5">
      {ARABIC_ALPHABET_ORDER.map((letter) => {
        const has = (counts[letter] ?? 0) > 0;
        if (!has) {
          return (
            <span key={letter} aria-disabled="true" className={`${base} ${off}`}>
              {letter}
            </span>
          );
        }
        const isActive = letter === activeLetter;
        return (
          <button
            key={letter}
            type="button"
            onClick={() => onSelect(letter)}
            {...(isActive ? { 'aria-current': 'true' as const } : {})}
            className={`${base} ${isActive ? active : idle}`}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
