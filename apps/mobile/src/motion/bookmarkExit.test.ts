import { describe, expect, it } from 'vitest';

import { RESTING_MAX_HEIGHT, ROW_GAP, rowExit } from './bookmarkExit';

describe('rowExit', () => {
  it('leaves a resting row unconstrained, and carrying the gap', () => {
    // The gap is the row's own, not the list's: the list cannot animate it and
    // the row cannot reach the list's.
    expect(rowExit(0, 120)).toEqual({ maxHeight: RESTING_MAX_HEIGHT, marginBottom: ROW_GAP });
  });

  it('gives back the height and the gap together on the way out', () => {
    expect(rowExit(0.5, 120)).toEqual({ maxHeight: 60, marginBottom: ROW_GAP / 2 });
  });

  it('ends at nothing at all, so the re-read moves nothing', () => {
    // Both halves. Collapsing the height alone was the defect: the row took no
    // height and still held ROW_GAP beside it, and the reload closed that in
    // one frame -- the second jump the eye actually saw (device, 2026-09-02).
    expect(rowExit(1, 120)).toEqual({ maxHeight: 0, marginBottom: 0 });
  });

  it('never returns a negative height for a row measured mid-collapse', () => {
    expect(rowExit(1.2, 120).maxHeight).toBe(0);
  });
});
