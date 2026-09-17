import type { WbwCell } from './types';

/** Split a verse's words into the spans one gloss covers.
 *
 *  Tasnim glosses phrases, not always single words: "shubha yo'q" is one
 *  gloss over both لَا and رَيْبَ, and `gloss_group` is what says so. Words
 *  outside any span carry a NULL group and each stand alone -- two words
 *  glossed with the same WORD are still two glosses, so the id is the only
 *  signal here, never the text.
 *
 *  Grouping is per language, because the group ids are: switching language
 *  re-reads the glosses and regroups with them.
 */
export function groupByGloss(cells: WbwCell[]): WbwCell[][] {
  const groups: WbwCell[][] = [];
  for (const cell of cells) {
    const last = groups[groups.length - 1];
    // Adjacency is required, not assumed. A span is contiguous by
    // construction; joining a non-adjacent repeat of an id would swallow
    // whatever word sits between the two halves.
    if (cell.glossGroup !== null && last && last[0]!.glossGroup === cell.glossGroup) {
      last.push(cell);
    } else {
      groups.push([cell]);
    }
  }
  return groups;
}
