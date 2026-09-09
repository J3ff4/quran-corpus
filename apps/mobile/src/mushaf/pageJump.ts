import type { PageEntry } from '@quran-corpus/data/mobile';

import type { JumpKind } from '@/components/mushaf/PageJumpSheet';

/**
 * The page a jump target opens on, or null if the index cannot name one.
 *
 * Off the loaded index rather than a query: `pages` already carries every
 * page's opening surah, its opening ayah and its juz. 604 rows, already in
 * memory, once per process.
 *
 * The lowest matching page, not the first in iteration order. A Map iterates in
 * insertion order, and nothing in the loader promises the index arrives sorted
 * -- a juz resolving to its LAST page instead of its first would be a jump
 * that lands in the wrong place only for the juz that span pages.
 */
export function pageForJump(
  pages: ReadonlyMap<number, PageEntry>,
  kind: JumpKind,
  value: number,
): number | null {
  if (kind === 'page') return pages.has(value) ? value : null;
  // A surah is not matched on `startSurahId`: that names the surah of a page's
  // FIRST ayah, so a surah that begins part-way down a page is never any page's
  // opener and would resolve to nothing. Seventeen do -- 81, 85, 91, 93, 95,
  // 97, 99, 101, 102, 104, 105, 107, 108, 110, 111, 113 and 114, checked
  // against the corpus -- and "Go to -> Surah" was silently dead for all of
  // them, since the sheet closes before `onJump` finds it has no page.
  if (kind === 'surah') return pageForAyah(pages, value, 1);

  let found: number | null = null;
  for (const [page, entry] of pages) {
    if (entry.juz === value && (found === null || page < found)) found = page;
  }
  return found;
}

/**
 * The page an ayah is printed on, from the index alone.
 *
 * The greatest page that OPENS at or before the coordinate. Pages run in
 * mushaf order and every page's opener is known, so the page a coordinate
 * falls on is the last one to start no later than it -- no layout rows and no
 * second query, which matters because both callers need an answer before the
 * pager has mounted.
 */
export function pageForAyah(
  pages: ReadonlyMap<number, PageEntry>,
  surahId: number,
  ayahNumber: number,
): number | null {
  let found: number | null = null;
  let foundKey: [number, number] | null = null;
  for (const [page, entry] of pages) {
    const key: [number, number] = [entry.startSurahId, entry.startAyahNumber];
    // At or before the target, and later than anything else at or before it.
    if (key[0] > surahId || (key[0] === surahId && key[1] > ayahNumber)) continue;
    const later =
      foundKey === null || key[0] > foundKey[0] || (key[0] === foundKey[0] && key[1] > foundKey[1]);
    // A tie takes the LOWER page, for the same reason the juz arm does: a Map
    // iterates in insertion order and nothing promises the index is sorted.
    const sameStart =
      foundKey !== null && key[0] === foundKey[0] && key[1] === foundKey[1] && page < (found ?? page);
    if (later || sameStart) {
      found = page;
      foundKey = key;
    }
  }
  return found;
}
