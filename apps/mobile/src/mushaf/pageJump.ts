import type { PageEntry } from '@quran-corpus/data/mobile';

import type { JumpKind } from '@/components/mushaf/PageJumpSheet';

/**
 * The page a jump target opens on, or null if the index cannot name one.
 *
 * Off the loaded index rather than a query: `pages` already carries every
 * page's opening surah and its juz, so the first row that names a surah or a
 * juz IS its first page. 604 rows, already in memory, once per process.
 *
 * The lowest matching page, not the first in iteration order. A Map iterates in
 * insertion order, and nothing in the loader promises the index arrives sorted
 * -- a surah resolving to its LAST page instead of its first would be a jump
 * that lands in the wrong place only for the surahs that span pages.
 */
export function pageForJump(
  pages: ReadonlyMap<number, PageEntry>,
  kind: JumpKind,
  value: number,
): number | null {
  if (kind === 'page') return pages.has(value) ? value : null;

  let found: number | null = null;
  for (const [page, entry] of pages) {
    const matches = kind === 'surah' ? entry.startSurahId === value : entry.juz === value;
    if (matches && (found === null || page < found)) found = page;
  }
  return found;
}
