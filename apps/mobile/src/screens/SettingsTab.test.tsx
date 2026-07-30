import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsTab from '../../app/(tabs)/settings';

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    uiLocale: 'en',
    contentLanguage: 'en',
    theme: 'system',
    analyticsEnabled: true,
    setUiLocale: vi.fn(),
    setContentLanguage: vi.fn(),
    setTheme: vi.fn(),
    setAnalyticsEnabled: vi.fn(),
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
    Pressable: ({ accessibilityRole, accessibilityState, children, onPress }: {
      accessibilityRole?: string;
      accessibilityState?: { checked?: boolean; selected?: boolean };
      children?: React.ReactNode;
      onPress?: () => void;
    }) =>
      React.createElement(
        'button',
        {
          role: accessibilityRole,
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
  it('exposes analytics as a checked switch', () => {
    render(<SettingsTab />);

    expect(screen.getByRole('switch', { checked: true })).toBeTruthy();
    expect(screen.getByText('Analytics: On')).toBeTruthy();
  });
});
