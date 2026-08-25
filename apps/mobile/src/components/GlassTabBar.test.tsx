import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));

import { GlassTabBar, type GlassTabBarProps } from './GlassTabBar';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';
import { rgb } from '@/testing/rgb';

const ROUTES = ['index', 'surahs', 'morphology', 'dictionary', 'menu'];

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
  afterEach(cleanup);

  it('renders one button per route', () => {
    renderBar(props(0));
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('marks the active route selected and tints it with the accent', () => {
    renderBar(props(2));

    const tabs = screen.getAllByRole('tab');
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('tab-morphology-label').style.color).toBe(rgb(themeColors.dark.accent));
    expect(screen.getByTestId('tab-index-label').style.color).toBe(rgb(themeColors.dark.mutedText));
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
