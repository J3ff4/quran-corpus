import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

import { ThemedStatusBar } from './ThemedStatusBar';
import { ThemeContext, type ThemeColors } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function renderIn(theme: ThemeColors, element: React.ReactElement) {
  return render(<ThemeContext.Provider value={theme}>{element}</ThemeContext.Provider>);
}

function bar() {
  return screen.getByTestId('system-status-bar');
}

describe('ThemedStatusBar', () => {
  afterEach(cleanup);

  // Both sides, because the bug this fixes was a bar that never asked at all:
  // expo's default resolves against the OS, which is right exactly half the
  // time and invisible the other half.
  it('asks for dark glyphs under the light theme', () => {
    renderIn(themeColors.light, <ThemedStatusBar />);
    expect(bar().getAttribute('data-style')).toBe('dark');
  });

  it('asks for light glyphs under the dark theme', () => {
    renderIn(themeColors.dark, <ThemedStatusBar />);
    expect(bar().getAttribute('data-style')).toBe('light');
  });

  it('still hides the bar where the caller asks, and still says which style', () => {
    renderIn(themeColors.light, <ThemedStatusBar hidden />);
    expect(bar().getAttribute('data-hidden')).toBe('true');
    expect(bar().getAttribute('data-style')).toBe('dark');
  });
});
