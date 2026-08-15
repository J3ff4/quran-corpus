import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider';
import { useThemeColors } from './themeContext';
import { themeColors } from './tokens';

const mocks = vi.hoisted(() => ({
  theme: 'system' as 'system' | 'light' | 'dark',
  systemScheme: 'light' as 'light' | 'dark' | null,
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ theme: mocks.theme }),
}));

vi.mock('react-native', () => ({
  useColorScheme: () => mocks.systemScheme,
}));

function Probe() {
  return <span>{useThemeColors().background}</span>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    mocks.theme = 'system';
    mocks.systemScheme = 'light';
  });

  // This suite renders more than once per file and the project does not enable
  // testing-library's global auto-cleanup, so without this each case queries
  // the leftover DOM of the previous one.
  afterEach(cleanup);

  it('follows the OS scheme when the preference is "system"', () => {
    mocks.systemScheme = 'dark';
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByText(themeColors.dark.background)).toBeTruthy();
  });

  it('lets an explicit preference override the OS scheme', () => {
    mocks.theme = 'light';
    mocks.systemScheme = 'dark';
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByText(themeColors.light.background)).toBeTruthy();
  });

  it('falls back to light while the OS scheme is still null', () => {
    mocks.systemScheme = null;
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByText(themeColors.light.background)).toBeTruthy();
  });

  it('paints the light palette with no provider, rather than throwing', () => {
    render(<Probe />);
    expect(screen.getByText(themeColors.light.background)).toBeTruthy();
  });
});
