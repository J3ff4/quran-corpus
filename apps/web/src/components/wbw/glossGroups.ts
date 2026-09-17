import { groupByGlossSpan } from '@quran-corpus/data/client';
import type { WbwCell } from './types';

/** Split a verse's words into the spans one gloss covers.
 *
 *  The rule lives in `packages/data` because mobile splits the same spans by
 *  the same rule -- this only says where a web cell keeps its group id. */
export function groupByGloss(cells: WbwCell[]): WbwCell[][] {
  return groupByGlossSpan(cells, (cell) => cell.glossGroup);
}
