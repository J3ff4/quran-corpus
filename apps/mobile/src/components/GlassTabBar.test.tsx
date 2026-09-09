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
    useAnimatedStyle: () => ({}),
    withTiming: (to: unknown) => to,
  };
});

import { GlassTabBar, type GlassTabBarProps } from './GlassTabBar';
import { hideChrome, releaseChrome } from '@/mushaf/chromeVisibility';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';
import { rgb } from '@/testing/rgb';

const ROUTES = ['index', 'surahs', 'mushaf', 'dictionary', 'menu'];

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
    const { rerender } = renderBar(props(0));
    expect(screen.getByTestId('tab-bar').getAttribute('data-hidden-from-a11y')).toBeNull();
    expect(screen.getByTestId('tab-bar').getAttribute('data-pointer-events')).toBe('box-none');

    act(() => hideChrome());
    rerender(
      <ThemeContext.Provider value={themeColors.dark}>
        <GlassTabBar {...props(0)} />
      </ThemeContext.Provider>,
    );
    // A faded bar still fills the bottom of the screen. If it keeps its touches
    // it eats the very tap that is meant to bring it back, and the mushaf tab
    // becomes a room with no door.
    expect(screen.getByTestId('tab-bar').getAttribute('data-hidden-from-a11y')).toBe('true');
    expect(screen.getByTestId('tab-bar').getAttribute('data-pointer-events')).toBe('none');
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
