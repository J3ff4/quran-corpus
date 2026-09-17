import { describe, it, expect } from 'vitest';
import { groupByGlossSpan } from '../src/text/glossSpans.js';

const w = (position: number, group: number | null) => ({ position, group });
const spans = (items: ReturnType<typeof w>[]) =>
  groupByGlossSpan(items, (item) => item.group).map((g) => g.map((item) => item.position));

describe('groupByGlossSpan', () => {
  it('joins adjacent words sharing a group id', () => {
    expect(spans([w(1, 4), w(2, 4), w(3, null)])).toEqual([[1, 2], [3]]);
  });

  it('leaves every ungrouped word standing alone', () => {
    // NULL is "this word's own gloss", not "the same group as the last NULL".
    // Folding them together would put one gloss under the whole verse.
    expect(spans([w(1, null), w(2, null)])).toEqual([[1], [2]]);
  });

  it('does not join a non-adjacent repeat of an id', () => {
    // A span is contiguous by construction, so a repeat with a different word
    // between the halves is bad data -- joining it would swallow word 2.
    expect(spans([w(1, 4), w(2, 9), w(3, 4)])).toEqual([[1], [2], [3]]);
  });

  it('keeps two consecutive spans apart', () => {
    expect(spans([w(1, 4), w(2, 4), w(3, 5), w(4, 5)])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('returns nothing for no words', () => {
    expect(spans([])).toEqual([]);
  });
});
