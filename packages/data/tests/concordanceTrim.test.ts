import { describe, it, expect } from 'vitest';
import { trimConcordanceVerse } from '../src/text/concordanceTrim.js';
import type { VerseWord } from '../src/types.js';

const mk = (n: number): VerseWord[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, position: i + 1, text_arabic: `w${i + 1}` }));

const mkClause = (n: number, boundaries: number[]): VerseWord[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1, position: i + 1, text_arabic: `w${i + 1}`,
    starts_clause: boundaries.includes(i + 1),
  }));

describe('trimConcordanceVerse', () => {
  it('short verse (≤9 words) is returned whole, no truncation', () => {
    const r = trimConcordanceVerse(mk(5), 3);
    expect(r.words.map((w) => w.id)).toEqual([1, 2, 3, 4, 5]);
    expect(r.truncatedBefore).toBe(false);
    expect(r.truncatedAfter).toBe(false);
  });
  it('match in the middle of a long verse → ±4 window, both sides truncated', () => {
    const r = trimConcordanceVerse(mk(30), 15); // ids 11..19
    expect(r.words.map((w) => w.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(r.truncatedBefore).toBe(true);
    expect(r.truncatedAfter).toBe(true);
    expect(r.words.some((w) => w.id === 15)).toBe(true);
  });
  it('match near the start → no before-truncation, window still holds the match', () => {
    const r = trimConcordanceVerse(mk(30), 2); // ids 1..? centered on 2, clamped left
    expect(r.words[0]!.id).toBe(1);
    expect(r.truncatedBefore).toBe(false);
    expect(r.truncatedAfter).toBe(true);
    expect(r.words.some((w) => w.id === 2)).toBe(true);
  });
  it('match near the end → no after-truncation', () => {
    const r = trimConcordanceVerse(mk(30), 29);
    expect(r.words[r.words.length - 1]!.id).toBe(30);
    expect(r.truncatedBefore).toBe(true);
    expect(r.truncatedAfter).toBe(false);
  });
  it('unknown match id → input returned untrimmed', () => {
    const r = trimConcordanceVerse(mk(5), 999);
    expect(r.words).toHaveLength(5);
    expect(r.truncatedBefore).toBe(false);
    expect(r.truncatedAfter).toBe(false);
  });
  it('trims to the clause when starts_clause is present', () => {
    // boundaries at words 1,6,11 → clauses [1..5],[6..10],[11..15]; match at 8
    const r = trimConcordanceVerse(mkClause(15, [1, 6, 11]), 8);
    expect(r.words.map((w) => w.id)).toEqual([6, 7, 8, 9, 10]);
    expect(r.truncatedBefore).toBe(true);
    expect(r.truncatedAfter).toBe(true);
  });
  it('caps an over-long clause at ±4 around the match', () => {
    // one clause spanning all 30 words (boundary only at 1); match at 15
    const r = trimConcordanceVerse(mkClause(30, [1]), 15);
    expect(r.words.map((w) => w.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });
  it("doesn't stop at the matched word's own boundary flag (80:31 wa-abban regression)", () => {
    // both words in the pair are boundary-flagged (e.g. each begins its own
    // conjunction) -- the match word being a boundary must not make it its
    // own left edge; the scan should walk past it to the *previous* boundary.
    const r = trimConcordanceVerse(mkClause(2, [1, 2]), 2);
    expect(r.words.map((w) => w.id)).toEqual([1, 2]);
    expect(r.truncatedBefore).toBe(false);
  });
  it('walks past a boundary-flagged match to the real clause start (22:45 wabi-rin regression)', () => {
    // boundaries at 1 and 7; match at 11 is itself boundary-flagged too --
    // the window must still reach back to 7, not stop at 11 (itself).
    const r = trimConcordanceVerse(mkClause(14, [1, 7, 11]), 11);
    expect(r.words.map((w) => w.id)).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
    expect(r.truncatedBefore).toBe(true);
    expect(r.truncatedAfter).toBe(false);
  });
});
