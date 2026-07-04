import { rootFirstLetter } from '@quran-corpus/data';

/** Count roots per folded first Arabic letter, for the alphabet grid. */
export function letterCounts(rootArabics: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ar of rootArabics) {
    const l = rootFirstLetter(ar);
    if (l) counts[l] = (counts[l] ?? 0) + 1;
  }
  return counts;
}
