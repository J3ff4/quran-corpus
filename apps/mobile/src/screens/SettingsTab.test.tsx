import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsTab from '../../app/(tabs)/settings';

const mocks = vi.hoisted(() => ({
  setArabicScale: vi.fn(),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    uiLocale: 'en',
    contentLanguage: 'en',
    theme: 'system',
    analyticsEnabled: true,
    arabicScale: 'large',
    setUiLocale: vi.fn(),
    setContentLanguage: vi.fn(),
    setTheme: vi.fn(),
    setAnalyticsEnabled: vi.fn(),
    setArabicScale: mocks.setArabicScale,
  }),
}));

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ children }: { children?: React.ReactNode }) => React.createElement('a', null, children),
  };
});

vi.mock('react-native', async () => {
  const React = await import('react');
  return {
    Pressable: ({ accessibilityLabel, accessibilityRole, accessibilityState, children, onPress }: {
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityState?: { checked?: boolean; selected?: boolean };
      children?: React.ReactNode;
      onPress?: () => void;
    }) =>
      React.createElement(
        'button',
        {
          role: accessibilityRole,
          // Forwarded because ChoiceOption sets it precisely so the decorative
          // bullet stays out of the accessible name.
          'aria-label': accessibilityLabel,
          'aria-checked': accessibilityState?.checked ?? accessibilityState?.selected,
          onClick: onPress,
        },
        children,
      ),
    Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
    View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  };
});

describe('SettingsTab', () => {
  beforeEach(() => {
    mocks.setArabicScale.mockClear();
  });

  afterEach(cleanup);

  it('marks the stored Arabic step as the selected one and writes a new choice', () => {
    render(<SettingsTab />);

    // 'large' is what the mocked store holds, so the checked radio has to be
    // that one and not the first option in the row.
    expect(screen.getByRole('radio', { name: 'Large' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Small' }).getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByRole('radio', { name: 'Extra large' }));

    expect(mocks.setArabicScale).toHaveBeenCalledWith('xlarge');
  });

  it('exposes analytics as a checked switch', () => {
    render(<SettingsTab />);

    expect(screen.getByRole('switch', { checked: true })).toBeTruthy();
    expect(screen.getByText('Analytics: On')).toBeTruthy();
  });
});
