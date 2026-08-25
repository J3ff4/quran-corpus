import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LayoutHandler = (event: { nativeEvent: { layout: { width: number; height: number } } }) => void;
type PanHandler = (event: { x: number }) => void;

const mocks = vi.hoisted(() => ({
  layouts: new Map<string, LayoutHandler>(),
  // The scrub track's whole behaviour lives in the pan builder's callbacks,
  // and GestureDetector renders nothing, so the recorded handlers are the only
  // way to reach them.
  gestures: new Map<string, (event: never) => void>(),
}));

/** One of the pan builder's recorded callbacks, e.g. `pan('onEnd')`. */
function pan(method: string) {
  return mocks.gestures.get(method) as PanHandler | undefined;
}

// The shim drops onLayout (there is no DOM equivalent), but the track's width
// is exactly what turns a touch into a position in seconds -- without it every
// scrub assertion below would be measuring a zero-width track.
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host, reactNativeTextMock } = await import('@/testing/rnHosts.js');
  const HostView = host('div');
  const View = ({
    onLayout,
    ...rest
  }: Record<string, unknown> & { onLayout?: LayoutHandler; testID?: string }) => {
    const testID = rest.testID as string | undefined;
    if (testID && onLayout) mocks.layouts.set(testID, onLayout);
    return React.createElement(HostView, rest);
  };
  return { ...reactNativeTextMock(), View };
});

vi.mock('react-native-gesture-handler', async () => {
  const { reactNativeGestureHandlerMock } = await import('@/testing/rnHosts.js');
  const gestureHandler = reactNativeGestureHandlerMock();
  mocks.gestures = gestureHandler.__gestureHandlers;
  return gestureHandler;
});

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

import { RecitationBar, formatClock, formatRemaining, scrubSeconds } from './RecitationBar';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

/** The track the scrub tests measure against. */
const TRACK_WIDTH = 400;

function renderBar(props: Partial<React.ComponentProps<typeof RecitationBar>> = {}) {
  const handlers = {
    onTogglePlay: vi.fn(),
    onSkipNext: vi.fn(),
    onSkipPrevious: vi.fn(),
    onSeek: vi.fn(),
    onToggleContinuous: vi.fn(),
  };
  render(
    <ThemeContext.Provider value={themeColors.dark}>
      <RecitationBar
        ayahNumber={255}
        playing
        positionSec={5}
        durationSec={30}
        continuous={false}
        reciterLabel="Mahmoud Khalil Al-Husary (Murattal)"
        uiLocale="en"
        {...handlers}
        {...props}
      />
    </ThemeContext.Provider>,
  );
  return handlers;
}

/** Give the scrub track a width, the way a layout pass would. */
function layoutTrack(width = TRACK_WIDTH) {
  act(() => {
    mocks.layouts.get('recitation-scrub')?.({ nativeEvent: { layout: { width, height: 40 } } });
  });
}

describe('formatClock', () => {
  it('renders m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(125)).toBe('2:05');
    expect(formatClock(3600)).toBe('60:00');
  });

  it('renders a placeholder for a duration that has not arrived', () => {
    // The player reports NaN until the track's metadata lands, which is the
    // first second of every single ayah. Arithmetic on it renders "NaN:NaN".
    expect(formatClock(Number.NaN)).toBe('--:--');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('--:--');
    expect(formatClock(-1)).toBe('--:--');
    expect(formatRemaining(0, Number.NaN)).toBe('--:--');
  });
});

describe('scrubSeconds', () => {
  it('reports a position in seconds, not a fraction of the track', () => {
    expect(scrubSeconds(200, 400, 120)).toBe(60);
    expect(scrubSeconds(100, 400, 120)).toBe(30);
  });

  it('clamps a touch outside the track', () => {
    // A pan that starts on the track and travels off it keeps reporting, and
    // an unclamped fraction seeks past the end of the ayah.
    expect(scrubSeconds(-40, 400, 120)).toBe(0);
    expect(scrubSeconds(999, 400, 120)).toBe(120);
  });

  it('refuses to place a touch it has nothing to measure against', () => {
    // Not 0: returning the start of the ayah would turn a stray touch during
    // the first frames into a jump back to the beginning.
    expect(scrubSeconds(200, 400, Number.NaN)).toBeNull();
    expect(scrubSeconds(200, 0, 120)).toBeNull();
    expect(scrubSeconds(200, 400, 0)).toBeNull();
  });
});

describe('RecitationBar', () => {
  beforeEach(() => {
    mocks.layouts.clear();
    mocks.gestures.clear();
  });

  afterEach(cleanup);

  it('is not rendered when nothing is playing', () => {
    renderBar({ ayahNumber: null, playing: false });

    expect(screen.queryByTestId('recitation-bar')).toBeNull();
  });

  it('names the ayah it is playing', () => {
    // A bar that says only "Pause" gives a screen-reader user no way to tell
    // which ayah is sounding.
    renderBar();

    expect(screen.getByTestId('recitation-bar').getAttribute('aria-label')).toContain('255');
  });

  it('toggles playback', () => {
    const { onTogglePlay } = renderBar();

    fireEvent.click(screen.getByLabelText('Pause'));

    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('offers to resume rather than to pause once playback has stopped', () => {
    // The bar outlives the sound: it stays docked on the ayah that was playing
    // so a tap resumes it. Labelled "Pause" while nothing plays, the one
    // control on the bar would lie about what it does.
    renderBar({ playing: false });

    expect(screen.getByLabelText('Play')).toBeTruthy();
    expect(screen.queryByLabelText('Pause')).toBeNull();
  });

  it('labels every transport control for a screen reader', () => {
    // The transport is five icons and no text. Unlabelled, TalkBack announces
    // five identical "button"s.
    renderBar();

    for (const label of ['Previous ayah', 'Pause', 'Next ayah', 'Continuous play']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('skips between ayahs', () => {
    const { onSkipNext, onSkipPrevious } = renderBar();

    fireEvent.click(screen.getByLabelText('Next ayah'));
    fireEvent.click(screen.getByLabelText('Previous ayah'));

    expect(onSkipNext).toHaveBeenCalledTimes(1);
    expect(onSkipPrevious).toHaveBeenCalledTimes(1);
  });

  it('announces whether continuous play is on', () => {
    // A toggle drawn only as a tinted icon is invisible to a screen reader,
    // and this one decides whether the surah plays on to the end.
    const { onToggleContinuous } = renderBar({ continuous: true });

    expect(screen.getByLabelText('Continuous play').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByLabelText('Continuous play'));

    expect(onToggleContinuous).toHaveBeenCalledTimes(1);
  });

  it('shows elapsed and remaining time', () => {
    renderBar({ positionSec: 65, durationSec: 125 });

    expect(screen.getByTestId('recitation-elapsed').textContent).toBe('1:05');
    expect(screen.getByTestId('recitation-remaining').textContent).toBe('-1:00');
  });

  it('reports a scrub as a position in seconds, not a fraction', () => {
    const { onSeek } = renderBar({ durationSec: 120 });
    layoutTrack();

    act(() => {
      pan('onEnd')?.({ x: TRACK_WIDTH / 2 });
    });

    // The controller clamps against the duration; handing it a 0..1 fraction
    // would seek to half a second on every track.
    expect(onSeek).toHaveBeenCalledWith(60);
  });

  it('follows the finger before the seek lands', () => {
    // The player is seeked once, on release. Without a local preview the clock
    // and the filled track would sit still under a moving finger for the whole
    // drag.
    const { onSeek } = renderBar({ positionSec: 5, durationSec: 120 });
    layoutTrack();

    act(() => {
      pan('onUpdate')?.({ x: TRACK_WIDTH / 4 });
    });

    expect(screen.getByTestId('recitation-elapsed').textContent).toBe('0:30');
    expect(screen.getByTestId('recitation-progress').style.width).toBe('25%');
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('hands the position back to the player once the drag ends', () => {
    // Left on the preview, the bar would report wherever the finger last was
    // for the rest of the ayah rather than where playback actually is.
    renderBar({ positionSec: 5, durationSec: 120 });
    layoutTrack();

    act(() => {
      pan('onUpdate')?.({ x: TRACK_WIDTH / 4 });
    });
    act(() => {
      pan('onFinalize')?.({ x: 0 });
    });

    expect(screen.getByTestId('recitation-elapsed').textContent).toBe('0:05');
  });

  it('does not seek while the track has no duration', () => {
    // NaN is what the player reports until the metadata lands. Seeking on it
    // sends the player to NaN seconds.
    const { onSeek } = renderBar({ durationSec: Number.NaN });
    layoutTrack();

    act(() => {
      pan('onEnd')?.({ x: TRACK_WIDTH / 2 });
    });

    expect(onSeek).not.toHaveBeenCalled();
    expect(screen.getByTestId('recitation-progress').style.width).toBe('0%');
  });

  it('leaves the reciter name inert until there is a picker to open', () => {
    // M6f task 5 supplies the sheet. A button that opens nothing is worse than
    // a label, so the name is only a control once someone can act on the tap.
    renderBar();
    expect(screen.getByTestId('recitation-reciter').getAttribute('role')).toBeNull();

    cleanup();
    const onOpenReciters = vi.fn();
    renderBar({ onOpenReciters });
    fireEvent.click(screen.getByTestId('recitation-reciter'));

    expect(onOpenReciters).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('recitation-reciter').getAttribute('aria-label')).toContain('Reciter');
  });
});
