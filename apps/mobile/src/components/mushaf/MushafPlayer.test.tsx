import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reduceMotion: false }));

vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

vi.mock('react-native-gesture-handler', async () => {
  const { reactNativeGestureHandlerMock } = await import('@/testing/rnHosts.js');
  return reactNativeGestureHandlerMock();
});

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', reduceMotion: mocks.reduceMotion }),
}));

import { setAutoLayout } from '@/testing/rnHosts';
import { CHROME_IDLE_MS, hideChrome, releaseChrome, showChrome } from '@/mushaf/chromeVisibility';

import { MushafPlayer } from './MushafPlayer';

function props(overrides: Partial<React.ComponentProps<typeof MushafPlayer>> = {}) {
  return {
    playing: false,
    ayahNumber: null,
    positionSec: 0,
    durationSec: NaN,
    continuous: false,
    reciterLabel: 'Al-Husary',
    uiLocale: 'en' as const,
    onTogglePlay: vi.fn(),
    onSkipNext: vi.fn(),
    onSkipPrevious: vi.fn(),
    onSeek: vi.fn(),
    onToggleContinuous: vi.fn(),
    onOpenReciters: vi.fn(),
    bottomOffset: 96,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.reduceMotion = false;
});

afterEach(() => {
  cleanup();
  setAutoLayout(null);
  // Module state, shared with the tab bar and the mushaf header. Left hidden,
  // the next suite in the file would render a player already out of the
  // reading order.
  releaseChrome();
});

describe('MushafPlayer', () => {
  it('shows one line at rest and the transport while playing', () => {
    const { rerender } = render(<MushafPlayer {...props()} playing={false} />);
    expect(screen.getByTestId('mushaf-player-compact')).toBeTruthy();
    expect(screen.queryByTestId('mushaf-player-full')).toBeNull();

    rerender(<MushafPlayer {...props()} playing ayahNumber={5} />);
    expect(screen.getByTestId('mushaf-player-full')).toBeTruthy();
    expect(screen.queryByTestId('mushaf-player-compact')).toBeNull();
  });

  it('goes back to one line when the sound stops', () => {
    // The half a symmetric rule gets wrong: `ayahNumber` survives a pause so
    // resume knows where to go, and a bar keyed on it would never shrink.
    const { rerender } = render(<MushafPlayer {...props()} playing ayahNumber={5} />);
    rerender(<MushafPlayer {...props()} playing={false} ayahNumber={5} />);
    expect(screen.getByTestId('mushaf-player-compact')).toBeTruthy();
    expect(screen.queryByTestId('mushaf-player-full')).toBeNull();
  });

  it('names the reciter on the compact bar, not just on the control', () => {
    render(<MushafPlayer {...props()} reciterLabel="Al-Husary" />);
    expect(screen.getByTestId('mushaf-player-compact').textContent).toContain('Al-Husary');
  });

  it('opens the reciter picker from the name', () => {
    const onOpenReciters = vi.fn();
    render(<MushafPlayer {...props({ onOpenReciters })} />);
    fireEvent.click(screen.getByTestId('mushaf-player-reciter'));
    expect(onOpenReciters).toHaveBeenCalled();
  });

  it('says the compact control starts the page, not just "play"', () => {
    // On 15 lines of glyphs with no per-ayah furniture, WHERE it starts is the
    // fact a screen-reader user needs before pressing.
    render(<MushafPlayer {...props()} />);
    expect(screen.getByTestId('mushaf-player-play').getAttribute('aria-label')).toBe('Play this page');
  });

  it('leaves the reading order and stops taking touches with the chrome', () => {
    hideChrome();
    render(<MushafPlayer {...props()} />);
    // A bar TalkBack can reach is a bar the user cannot see to know they
    // reached -- and a faded bar that still takes touches eats the tap meant
    // to bring the chrome back.
    expect(screen.getByTestId('mushaf-player').getAttribute('data-hidden-from-a11y')).toBe('true');
    expect(screen.getByTestId('mushaf-player').getAttribute('data-pointer-events')).toBe('none');
  });

  it('stays reachable while the chrome is up', () => {
    render(<MushafPlayer {...props()} />);
    expect(screen.getByTestId('mushaf-player').getAttribute('data-hidden-from-a11y')).toBeNull();
    expect(screen.getByTestId('mushaf-player').getAttribute('data-pointer-events')).toBe('box-none');
  });

  it('restarts the idle countdown from a touch anywhere on it', () => {
    // Ruling 10: the 3.5s runs from the LAST touch of the player, not from the
    // last page turn. Asserted through the real chromeVisibility module rather
    // than a spy -- what matters is that the chrome stayed, not that a
    // function was called.
    //
    // From a VISIBLE bar, because that is the only state where the handler is
    // reachable: hidden, the player is pointerEvents:'none' and the platform
    // hit-test never gets to it. Touching it there tested a path no finger can
    // take, and proved only that the chrome appeared -- never that the
    // countdown restarted, which is the whole of the ruling.
    vi.useFakeTimers();
    try {
      act(() => showChrome());
      render(<MushafPlayer {...props()} />);

      act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 500));
      fireEvent.touchStart(screen.getByTestId('mushaf-player'));

      // Past the ORIGINAL expiry, and still up: the touch replaced the timer.
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByTestId('mushaf-player').getAttribute('data-pointer-events')).toBe(
        'box-none',
      );

      // And it is a restart, not a cancel -- a full fresh interval still hides.
      act(() => vi.advanceTimersByTime(CHROME_IDLE_MS));
      expect(screen.getByTestId('mushaf-player').getAttribute('data-pointer-events')).toBe('none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sizes its box to the bar it measured, not to a guess', () => {
    // The grow is a height animation, so an unmeasured box is a bar clipped to
    // nothing. The box carries the shadow room on top of the measured height.
    setAutoLayout({ width: 320, height: 48 });
    const { rerender } = render(<MushafPlayer {...props()} />);
    // Rendered twice on purpose: the shim reads an animated style at render
    // time, while on the device the shared value drives it from the UI thread
    // with no render at all. The second pass is the suite's only window onto
    // a value written after the first one's layout.
    rerender(<MushafPlayer {...props()} />);
    const box = screen.getByTestId('mushaf-player').firstElementChild as HTMLElement;
    expect(box.style.height).toBe('80px');
  });
});
