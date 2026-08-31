import { describe, expect, it } from 'vitest';

import {
  ICON_MIN_SCALE,
  ICON_THRESHOLD,
  PANEL_GAP,
  PANEL_WIDTH,
  iconProgress,
  iconScale,
  panelWidth,
} from './swipePanel';

describe('panelWidth', () => {
  it('is nothing until the drag has opened more than the gap', () => {
    // The whole bug this replaces: the panel used to be full width on the
    // first pixel of drag.
    expect(panelWidth(0, PANEL_GAP, PANEL_WIDTH)).toBe(0);
    expect(panelWidth(-1, PANEL_GAP, PANEL_WIDTH)).toBe(0);
    expect(panelWidth(-PANEL_GAP, PANEL_GAP, PANEL_WIDTH)).toBe(0);
  });

  it('fills exactly the gap the row has opened', () => {
    expect(panelWidth(-(PANEL_GAP + 20), PANEL_GAP, PANEL_WIDTH)).toBe(20);
    expect(panelWidth(-(PANEL_GAP + 61), PANEL_GAP, PANEL_WIDTH)).toBe(61);
  });

  it('grows with the drag rather than jumping', () => {
    const widths = [10, 20, 40, 60].map((d) => panelWidth(-(PANEL_GAP + d), PANEL_GAP, PANEL_WIDTH));
    expect(widths).toEqual([10, 20, 40, 60]);
  });

  it('shrinks back through the same widths as the row retracts', () => {
    // Retraction is the same function read backwards, which is what keeps the
    // panel from sitting at full size under a returning card.
    const out = [60, 40, 20, 0].map((d) => panelWidth(-(PANEL_GAP + d), PANEL_GAP, PANEL_WIDTH));
    expect(out).toEqual([60, 40, 20, 0]);
  });

  it('stops at the panel width, so overshoot does not widen it', () => {
    expect(panelWidth(-(PANEL_GAP + PANEL_WIDTH), PANEL_GAP, PANEL_WIDTH)).toBe(PANEL_WIDTH);
    expect(panelWidth(-(PANEL_GAP + PANEL_WIDTH + 40), PANEL_GAP, PANEL_WIDTH)).toBe(PANEL_WIDTH);
  });

  it('never returns a negative width', () => {
    // A left-swipe drags the row the other way, and a negative width does not
    // render.
    expect(panelWidth(120, PANEL_GAP, PANEL_WIDTH)).toBe(0);
  });
});

describe('iconProgress', () => {
  it('holds at nothing while the panel is still a sliver', () => {
    expect(iconProgress(0, ICON_THRESHOLD)).toBe(0);
    expect(iconProgress(ICON_THRESHOLD / 2, ICON_THRESHOLD)).toBe(0);
    expect(iconProgress(ICON_THRESHOLD, ICON_THRESHOLD)).toBe(0);
  });

  it('reaches full strength exactly when the panel does', () => {
    expect(iconProgress(1, ICON_THRESHOLD)).toBe(1);
    expect(iconProgress(1.4, ICON_THRESHOLD)).toBe(1);
  });

  it('rescales the remainder rather than offsetting it', () => {
    // Halfway between the threshold and 1 is half the icon's own progress --
    // not `0.7 - 0.4`, which would leave the icon short of full at full drag.
    const halfway = ICON_THRESHOLD + (1 - ICON_THRESHOLD) / 2;
    expect(iconProgress(halfway, ICON_THRESHOLD)).toBeCloseTo(0.5, 10);
  });

  it('rises monotonically', () => {
    const steps = [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => iconProgress(p, ICON_THRESHOLD));
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]!).toBeGreaterThanOrEqual(steps[i - 1]!);
    }
  });
});

describe('iconScale', () => {
  it('starts small and ends at full size', () => {
    expect(iconScale(0, ICON_MIN_SCALE)).toBe(ICON_MIN_SCALE);
    expect(iconScale(1, ICON_MIN_SCALE)).toBe(1);
  });

  it('never inverts or exceeds full size across the whole drag', () => {
    // Fed through iconProgress, the way the animated style does it, so the
    // pair is checked as the caller composes them.
    for (const p of [0, 0.3, 0.5, 0.75, 1, 1.2]) {
      const scale = iconScale(iconProgress(p, ICON_THRESHOLD), ICON_MIN_SCALE);
      expect(scale).toBeGreaterThanOrEqual(ICON_MIN_SCALE);
      expect(scale).toBeLessThanOrEqual(1);
    }
  });

  it('grows with the icon rather than sitting at one size', () => {
    const first = iconScale(iconProgress(0.5, ICON_THRESHOLD), ICON_MIN_SCALE);
    const later = iconScale(iconProgress(0.9, ICON_THRESHOLD), ICON_MIN_SCALE);
    expect(later).toBeGreaterThan(first);
  });
});
