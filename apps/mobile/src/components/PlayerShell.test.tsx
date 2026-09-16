import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

const timings = vi.hoisted(() => ({ durations: [] as number[] }));

// A local reanimated shim, because the global one resolves withTiming straight
// to its target -- which makes an animated step and an instant one identical to
// every assertion about height. Whether a curve was ISSUED is the only
// observable difference, so this records that.
vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
    default: { View: host('div') },
    // One box per mount, not a fresh object per render: a shared value handed
    // back new each time loses every write made to it.
    useSharedValue: (initial: number) => {
      const box = React.useRef({ value: initial });
      return box.current;
    },
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: (to: number, config?: { duration: number }) => {
      timings.durations.push(config?.duration ?? 0);
      return to;
    },
  };
});

import { setAutoLayout } from '@/testing/rnHosts';
import { PlayerShell, SHADOW_ROOM } from './PlayerShell';

afterEach(() => {
  cleanup();
  setAutoLayout(null);
  timings.durations.length = 0;
});

function shell(expanded: boolean, growMs = 280, room?: number) {
  return (
    <PlayerShell
      expanded={expanded}
      growMs={growMs}
      {...(room === undefined ? {} : { room })}
      compact={<span>one line</span>}
      full={<span>full transport</span>}
    />
  );
}

/** The box whose height the grow animates. */
function box() {
  return screen.getByText(/one line|full transport/).closest('div')?.parentElement
    ?.parentElement as HTMLElement;
}

describe('PlayerShell', () => {
  it('shows the resting line, and the transport once expanded', () => {
    const { rerender } = render(shell(false));
    expect(screen.getByText('one line')).toBeTruthy();
    expect(screen.queryByText('full transport')).toBeNull();

    rerender(shell(true));

    expect(screen.getByText('full transport')).toBeTruthy();
    expect(screen.queryByText('one line')).toBeNull();
  });

  it('sizes the box to what it measured, with room for the shadow', () => {
    // The grow is a height animation, so an unmeasured box is a bar clipped to
    // nothing. Rendered twice on purpose: the shim reads an animated style at
    // render time, while on the device the shared value drives it from the UI
    // thread with no render at all -- the second pass is the suite's only
    // window onto a value written after the first one's layout.
    setAutoLayout({ width: 320, height: 48 });
    const { rerender } = render(shell(false));
    rerender(shell(false));

    expect(box().style.height).toBe(`${48 + SHADOW_ROOM * 2}px`);
  });

  it('leaves no gutter at all where the caller asked for none', () => {
    // Home's card sits in a stack of cards. The gutter is invisible but it is
    // layout, so it inset the card from both screen edges and stacked on the
    // screen's own gap -- the one card narrower than its neighbours.
    setAutoLayout({ width: 320, height: 48 });
    const { rerender } = render(shell(false, 280, 0));
    rerender(shell(false, 280, 0));

    expect(box().style.height).toBe('48px');
    const content = box().firstElementChild as HTMLElement;
    expect(content.style.left).toBe('0px');
    expect(content.style.right).toBe('0px');
    expect(content.style.bottom).toBe('0px');
  });

  it('snaps to the first height it measures rather than growing into it', () => {
    // There is no height to grow FROM on the frame a state first appears. A
    // 0 -> full curve there would play an unasked-for entrance every time the
    // player mounts, which is a bar unfolding at someone who did nothing.
    setAutoLayout({ width: 320, height: 48 });
    const { rerender } = render(shell(false));
    rerender(shell(false));

    expect(box().style.height).toBe(`${48 + SHADOW_ROOM * 2}px`);
    // No curve was issued at all -- which is the half an assertion on the
    // height cannot see, since a resolved curve and a snap land on the same
    // number.
    expect(timings.durations).toEqual([]);
  });

  it('grows with a curve once there is a height to grow from', () => {
    setAutoLayout({ width: 320, height: 48 });
    const { rerender } = render(shell(false));
    rerender(shell(false));
    timings.durations.length = 0;

    setAutoLayout({ width: 320, height: 96 });
    rerender(shell(true));

    expect(timings.durations).toEqual([280]);
  });

  it('snaps when the state already showing is re-measured, rather than sagging into it', () => {
    // A re-layout of the RESTING bar is not a state change and must not play
    // the grow. It did, and the owner caught it on the mushaf (2026-09-15):
    // picking a reciter re-measures the bar under the closing sheet, and a
    // 280ms curve to a height a pixel or two away is a bar that visibly dips
    // and comes back.
    setAutoLayout({ width: 320, height: 48 });
    const { rerender } = render(shell(false));
    rerender(shell(false));
    timings.durations.length = 0;

    setAutoLayout({ width: 320, height: 44 });
    rerender(shell(false));

    expect(timings.durations).toEqual([]);
    rerender(shell(false));
    expect(box().style.height).toBe(`${44 + SHADOW_ROOM * 2}px`);
  });

  it('retargets a grow whose real height lands a commit late, rather than cutting it', () => {
    // Only the active child is mounted, so a transition is issued against the
    // last height measured for the state it is moving TO -- and the true one
    // arrives a commit later. Snapping there would hard-assign mid-curve and
    // jump the bar at the end of every grow whose height had changed.
    setAutoLayout({ width: 320, height: 48 });
    const { rerender } = render(shell(false));
    rerender(shell(false));

    setAutoLayout({ width: 320, height: 96 });
    rerender(shell(true));
    expect(timings.durations).toEqual([280]);

    // The late measurement, inside the curve.
    setAutoLayout({ width: 320, height: 104 });
    rerender(shell(true));

    expect(timings.durations).toHaveLength(2);
    // Over what is LEFT of the curve, not a fresh full one.
    expect(timings.durations[1]).toBeGreaterThan(0);
    expect(timings.durations[1]).toBeLessThanOrEqual(280);
  });

  it('crosses instantly under reduced motion', () => {
    setAutoLayout({ width: 320, height: 48 });
    const { rerender } = render(shell(false, 0));
    rerender(shell(false, 0));

    setAutoLayout({ width: 320, height: 96 });
    rerender(shell(true, 0));

    expect(timings.durations).toEqual([0]);
  });

  it('draws nothing but its content before anything is measured', () => {
    // Before the first measurement the box has to size to its content, which
    // is how the content gets measured at all. A height of 0 here is a player
    // that never appears.
    render(shell(false));

    expect(box().style.height).toBe('');
  });
});
