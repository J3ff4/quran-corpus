import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('@/motion/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('react-native-reanimated', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return {
    default: { View: host('div') },
    // The bar's hidden state has to be observable without a real animation
    // driver, so what this suite asserts is the props that carry it --
    // pointerEvents and the accessibility flags -- not the transform.
    // A closed keyboard: BottomSheet subtracts this from its own translate.
    useAnimatedStyle: () => ({}),
    withTiming: (to: unknown) => to,
  };
});

import { GlassTabBar, type GlassTabBarProps } from './GlassTabBar';
import {
  CHROME_IDLE_MS,
  hideChrome,
  releaseChrome,
  showChrome,
  useChromeVisible,
} from '@/mushaf/chromeVisibility';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';
import { rgb } from '@/testing/rgb';

const ROUTES = ['index', 'surahs', 'mushaf', 'dictionary', 'menu'];

/** The module's own value, read without a component of the bar's in the way. */
function chromeIsVisible(): boolean {
  let seen = false;
  function Probe() {
    seen = useChromeVisible();
    return null;
  }
  render(<Probe />);
  return seen;
}

function props(index: number, navigate = vi.fn(), defaultPrevented = false): GlassTabBarProps {
  return {
    state: { index, routes: ROUTES.map((name) => ({ key: name, name })) },
    navigation: { navigate, emit: () => ({ defaultPrevented }) },
    insets: { bottom: 0 },
  };
}

function renderBar(barProps: GlassTabBarProps) {
  return render(
    <ThemeContext.Provider value={themeColors.dark}>
      <GlassTabBar {...barProps} />
    </ThemeContext.Provider>,
  );
}

describe('GlassTabBar', () => {
  afterEach(() => {
    cleanup();
    releaseChrome();
  });

  it('renders one button per route', () => {
    renderBar(props(0));
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('marks the active route selected and tints it with the accent', () => {
    renderBar(props(2));

    const tabs = screen.getAllByRole('tab');
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('tab-mushaf-label').style.color).toBe(rgb(themeColors.dark.accent));
    expect(screen.getByTestId('tab-index-label').style.color).toBe(rgb(themeColors.dark.mutedText));
  });

  it('carries the mushaf tab, and no longer the morphology one', () => {
    // The map is keyed by route name, so a renamed tab does not fail loudly --
    // it renders nothing at all and the bar comes up four wide.
    renderBar({
      ...props(0),
      state: { index: 0, routes: [...ROUTES, 'morphology'].map((name) => ({ key: name, name })) },
    });
    expect(screen.getByTestId('tab-mushaf-label')).toBeTruthy();
    expect(screen.queryByTestId('tab-morphology-label')).toBeNull();
  });

  it('goes away with the mushaf-s chrome, touches and TalkBack together', () => {
    // Index 2 is the mushaf: the hidden state only applies on the one tab that
    // can undo it.
    const { rerender } = renderBar(props(2));
    expect(screen.getByTestId('tab-bar').getAttribute('data-hidden-from-a11y')).toBeNull();
    expect(screen.getByTestId('tab-bar').getAttribute('data-pointer-events')).toBe('box-none');

    act(() => hideChrome());
    rerender(
      <ThemeContext.Provider value={themeColors.dark}>
        <GlassTabBar {...props(2)} />
      </ThemeContext.Provider>,
    );
    // A faded bar still fills the bottom of the screen. If it keeps its touches
    // it eats the very tap that is meant to bring it back, and the mushaf tab
    // becomes a room with no door.
    expect(screen.getByTestId('tab-bar').getAttribute('data-hidden-from-a11y')).toBe('true');
    expect(screen.getByTestId('tab-bar').getAttribute('data-pointer-events')).toBe('none');
  });

  it('stays on screen on every tab but the mushaf, whatever the chrome says', () => {
    // The chrome flag is module state and MushafScreen is its only writer, so a
    // blur cleanup that does not run leaves it false for the whole app. Seen
    // once on the Menu tab (vc11 run, 2026-09-13): no tab bar, no way to switch
    // tabs, force-stop the only way out. The bar knows which tab it is drawing
    // for, so a stranded flag cannot reach the tabs that have no undo.
    act(() => hideChrome());
    renderBar(props(4));

    expect(screen.getByTestId('tab-bar').getAttribute('data-hidden-from-a11y')).toBeNull();
    expect(screen.getByTestId('tab-bar').getAttribute('data-pointer-events')).toBe('box-none');
  });

  it('navigates to the route that was pressed', () => {
    const navigate = vi.fn();
    renderBar(props(0, navigate));

    fireEvent.click(screen.getAllByRole('tab')[3]!);
    // By name, not by index: expo-router navigates by route name and an
    // index-based call silently lands on the wrong screen the moment a tab is
    // inserted.
    expect(navigate).toHaveBeenCalledWith('dictionary');
  });

  it('restarts the mushaf idle countdown from a touch on the bar', () => {
    // Ruling 10: the countdown runs from the last touch of EITHER the player or
    // the bar, so reaching for a tab and changing your mind does not leave the
    // chrome sliding away under your finger.
    //
    // From a VISIBLE bar: hidden, it is pointerEvents:'none' and no touch
    // reaches it at all -- the tap that brings the chrome back lands on the
    // page. Firing at it there asserted only that the chrome appeared, which
    // is not what this handler is for.
    vi.useFakeTimers();
    try {
      act(() => showChrome());
      renderBar(props(2));

      act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 500));
      fireEvent.touchStart(screen.getByTestId('tab-bar'));

      act(() => vi.advanceTimersByTime(600));
      expect(chromeIsVisible()).toBe(true);

      act(() => vi.advanceTimersByTime(CHROME_IDLE_MS));
      expect(chromeIsVisible()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start a countdown from a touch on any other tab', () => {
    // showChrome() also STARTS the 3.5s timer. Called from a tab with no chrome
    // of its own, it would arm a hide against a mushaf nobody is looking at --
    // so walking back to it 4 seconds later would find the page already bare.
    hideChrome();
    renderBar(props(0));

    fireEvent.touchStart(screen.getByTestId('tab-bar'));

    // Visible because it is not the mushaf, not because anything was shown.
    expect(chromeIsVisible()).toBe(false);
  });

  it('does not navigate when the active tab is pressed again', () => {
    const navigate = vi.fn();
    renderBar(props(1, navigate));

    fireEvent.click(screen.getAllByRole('tab')[1]!);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('respects a screen that prevented the tab press', () => {
    // The reader listens for tabPress to scroll to top rather than re-navigate;
    // navigating anyway would throw its scroll position away.
    const navigate = vi.fn();
    renderBar(props(0, navigate, true));

    fireEvent.click(screen.getAllByRole('tab')[2]!);
    expect(navigate).not.toHaveBeenCalled();
  });
});
