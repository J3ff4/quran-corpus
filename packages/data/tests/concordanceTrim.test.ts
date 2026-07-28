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
  it('short verse (≤10 words) is returned whole, no truncation', () => {
    const r = trimConcordanceVerse(mk(10), 3);
    expect(r.words.map((w) => w.id)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(r.truncatedBefore).toBe(false);
    expect(r.truncatedAfter).toBe(false);
  });
  it('match in the middle of a long verse → 11-word window, both sides truncated', () => {
    const r = trimConcordanceVerse(mk(30), 15); // ids 10..20
    expect(r.words.map((w) => w.id)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(r.truncatedBefore).toBe(true);
    expect(r.truncatedAfter).toBe(true);
    expect(r.words.some((w) => w.id === 15)).toBe(true);
  });
  it('match near the start → no before-truncation, window still holds the match', () => {
    const r = trimConcordanceVerse(mk(30), 2); // ids 1..7, clamped left
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
  it('trims to the clause when starts_clause is present, padded to the minimum window', () => {
    // boundaries at 1,6,11 -> natural clause [6..10] (5 words); each side is
    // only 2 words from the match, under the 3-word minimum, so both pad out.
    const r = trimConcordanceVerse(mkClause(15, [1, 6, 11]), 8);
    expect(r.words.map((w) => w.id)).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(r.truncatedBefore).toBe(true);
    expect(r.truncatedAfter).toBe(true);
  });
  it('caps an over-long clause at 11 words total around the match', () => {
    // one clause spanning all 30 words (boundary only at 1); match at 15
    const r = trimConcordanceVerse(mkClause(30, [1]), 15);
    expect(r.words.map((w) => w.id)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });
  it("doesn't trim a verse of 10 words or fewer even with clause info present", () => {
    // regression (15:31): a short verse must never be windowed, even when a
    // clause boundary sits right next to the match.
    const r = trimConcordanceVerse(mkClause(7, [4]), 2);
    expect(r.words.map((w) => w.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.truncatedBefore).toBe(false);
    expect(r.truncatedAfter).toBe(false);
  });
  it("doesn't cap a clause side that isn't actually long (4:169 regression)", () => {
    // left side naturally reaches back 5 words (no boundary before it) --
    // under the old ±4 cap this got trimmed to 4 for no real reason. Per-side
    // length is left alone here; only the combined-window squeeze can shrink
    // it, and this window is already under the 11-word cap.
    const r = trimConcordanceVerse(mkClause(11, [7]), 6);
    expect(r.words[0]!.id).toBe(1);
    expect(r.truncatedBefore).toBe(false);
  });
  it('stops the initial walk right at the match when it genuinely starts a clause, then pads to the minimum (18:77 regression)', () => {
    // boundaries at 1, 7, 8 -- match (7) and the very next word (8) are both
    // boundaries, so the natural clause is just the match alone. The walk
    // still correctly identifies clause 2 starts at 7 (not 1); the separate
    // minimum-window pad then pulls in context from both neighbors since
    // there's nothing to work with in the 1-word natural clause itself.
    const r = trimConcordanceVerse(mkClause(14, [1, 7, 8]), 7);
    expect(r.words.map((w) => w.id)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(r.truncatedBefore).toBe(true);
    expect(r.truncatedAfter).toBe(true);
  });
});
