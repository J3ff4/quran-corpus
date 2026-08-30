import { describe, expect, it } from 'vitest';

import { SEGMENT_GAP, pillOffset, segmentWidth } from './segmentedPill';

describe('segmentedPill', () => {
  it('lands the last segment flush with the row it was measured from', () => {
    // The assertion that actually pins the arithmetic: a width that forgets the
    // gaps, or an offset that forgets to add one, both still produce plausible
    // numbers -- they only disagree at the far edge. Four segments, so three
    // gaps, and the pill's right edge has to be the row's.
    const row = 320;
    const width = segmentWidth(row, 4);

    expect(pillOffset(3, width) + width).toBeCloseTo(row, 10);
  });

  it('leaves exactly one gap between neighbouring segments', () => {
    const width = segmentWidth(320, 4);

    expect(pillOffset(1, width) - (pillOffset(0, width) + width)).toBeCloseTo(SEGMENT_GAP, 10);
  });

  it('reports 0 before the row has been measured', () => {
    // 0 is what tells SegmentedControl not to draw the pill yet. A width
    // computed from an unmeasured row would be negative, and a pill with a
    // negative width is a sliver at the left edge on the first frame.
    expect(segmentWidth(0, 3)).toBe(0);
  });

  it('reports 0 for a row too narrow to hold its own gaps', () => {
    // Three segments need two gaps = 8pt before any segment gets a point.
    expect(segmentWidth(6, 3)).toBe(0);
  });

  it('reports 0 for an empty option list rather than dividing by zero', () => {
    expect(segmentWidth(320, 0)).toBe(0);
  });
});
