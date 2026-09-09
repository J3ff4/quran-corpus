import type { MushafLine, MushafWord } from '@quran-corpus/data/mobile';

export const MUSHAF_LINES_PER_PAGE = 15;

export type PageSlot =
  | { kind: 'words'; line: number; words: MushafWord[] }
  | { kind: 'header'; line: number; surahId: number }
  | { kind: 'bismillah'; line: number }
  | { kind: 'blank'; line: number };

/**
 * The 18 pages whose NEXT page's surah band sits on their own line 15.
 *
 * Closed set, derived from the layout: trailing gaps exist on 20 pages, two of
 * which are the short opening panels (1 and 2); these are the other 18, and
 * they are exactly the pages preceding a surah whose own gap run is one line.
 * Without this, those 18 next-pages draw a header where the bismillah belongs
 * and lose the bismillah entirely.
 */
export const PAGES_WITH_HEADER_ON_PREVIOUS_PAGE: ReadonlySet<number> = new Set([
  77, 208, 332, 342, 350, 367, 377, 415, 418, 446, 453, 499, 507, 526, 549, 556, 558, 585,
]);

/**
 * Pages whose own line 15 carries the NEXT page's surah band, and which surah.
 *
 * The mirror of the set above, and the reason it is a Map: the band belongs to
 * a surah that has no words on this page at all, so nothing in this page's rows
 * can name it. A page here ends its words early -- without this entry the loop
 * would stop at that last word line and the band would simply never be drawn.
 */
export const TRAILING_BAND_SURAH: ReadonlyMap<number, number> = new Map([
  [76, 4],
  [207, 10],
  [331, 22],
  [341, 23],
  [349, 24],
  [366, 26],
  [376, 27],
  [414, 32],
  [417, 33],
  [445, 37],
  [452, 38],
  [498, 45],
  [506, 47],
  [525, 53],
  [548, 60],
  [555, 64],
  [557, 65],
  [584, 80],
]);

export function composePage(page: number, lines: MushafLine[]): PageSlot[] {
  const byLine = new Map(lines.map((l) => [l.line, l]));
  if (byLine.size === 0) return [];
  const trailingBandSurah = TRAILING_BAND_SURAH.get(page);
  // A trailing band sits past every word line, so the page runs to 15 here
  // even though its own rows stop earlier.
  const lastLine =
    trailingBandSurah === undefined ? Math.max(...byLine.keys()) : MUSHAF_LINES_PER_PAGE;

  // Which line starts a surah, and which surah. A surah's first word is
  // ayah 1 position 1 -- position, not seq: seq is a place on a line.
  const startsSurah = new Map<number, number>();
  for (const line of lines) {
    const first = line.words.find((word) => word.ayahNumber === 1 && word.position === 1);
    if (first) startsSurah.set(line.line, first.surahId);
  }

  const slots: PageSlot[] = [];
  let line = 1;
  while (line <= lastLine) {
    const present = byLine.get(line);
    if (present) {
      slots.push({ kind: 'words', line, words: present.words });
      line += 1;
      continue;
    }

    // Walk to the end of THIS RUN of missing lines before deciding anything.
    // The run's length is what says whether the chrome is a band plus a
    // bismillah or a bismillah alone -- measuring from the current line
    // instead makes the second line of every two-line run look like a
    // one-line run, which draws two bands and no bismillah at all.
    let next = line + 1;
    while (next <= lastLine && !byLine.has(next)) next += 1;
    const runLength = next - line;
    const surahId = startsSurah.get(next);

    for (let offset = 0; offset < runLength; offset += 1) {
      const slotLine = line + offset;
      if (surahId === undefined) {
        // No surah starts after this run, so it is empty page -- except line
        // 15 of the 18 pages that carry the next page's band.
        slots.push(
          slotLine === MUSHAF_LINES_PER_PAGE && trailingBandSurah !== undefined
            ? { kind: 'header', line: slotLine, surahId: trailingBandSurah }
            : { kind: 'blank', line: slotLine },
        );
      } else if (runLength >= 2) {
        // Band then bismillah, both at the BOTTOM of the run: a longer run
        // (page 1 opens with one) keeps its extra lines blank above them.
        if (offset === runLength - 2) slots.push({ kind: 'header', line: slotLine, surahId });
        else if (offset === runLength - 1) slots.push({ kind: 'bismillah', line: slotLine });
        else slots.push({ kind: 'blank', line: slotLine });
      } else {
        slots.push(
          PAGES_WITH_HEADER_ON_PREVIOUS_PAGE.has(page)
            ? { kind: 'bismillah', line: slotLine }
            : { kind: 'header', line: slotLine, surahId },
        );
      }
    }
    line = next;
  }
  return slots;
}
