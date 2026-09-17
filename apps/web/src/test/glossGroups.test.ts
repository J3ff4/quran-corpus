import { describe, it, expect } from 'vitest';
import { groupByGloss } from '../components/wbw/glossGroups';
import type { WbwCell } from '../components/wbw/types';

function cell(position: number, gloss: string, glossGroup: number | null): WbwCell {
  return {
    surahId: 2, ayahNumber: 2, position,
    arabic: 'x', translit: null, gloss, glossLang: 'uz', glossGroup,
    posTag: null, posLabel: null, segments: [], grammarNote: null,
  };
}

describe('groupByGloss', () => {
  it('joins consecutive words that share a group', () => {
    const cells = [cell(1, "shubha yo'q", 4), cell(2, "shubha yo'q", 4), cell(3, 'unda', null)];
    expect(groupByGloss(cells).map((g) => g.map((c) => c.position))).toEqual([[1, 2], [3]]);
  });

  it('never groups a null gloss_group, even when the text repeats', () => {
    // Two words glossed alike are two glosses; only the group id says otherwise.
    const cells = [cell(1, 'and', null), cell(2, 'and', null)];
    expect(groupByGloss(cells).map((g) => g.map((c) => c.position))).toEqual([[1], [2]]);
  });

  it('does not join two runs that share an id but are not adjacent', () => {
    // Defensive: a span is contiguous by construction, and a non-contiguous
    // one would silently swallow the word between it.
    const cells = [cell(1, 'a', 4), cell(2, 'b', 9), cell(3, 'a', 4)];
    expect(groupByGloss(cells).map((g) => g.map((c) => c.position))).toEqual([[1], [2], [3]]);
  });

  it('returns nothing for no cells', () => {
    expect(groupByGloss([])).toEqual([]);
  });
});
