import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuScreen } from './MenuScreen';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en' }),
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.2.3' } },
}));

vi.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mocks.push(...args) },
}));

vi.mock('react-native', async () => {
  const { host, StyleSheet } = await import('@/testing/rnHosts.js');
  return {
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => {} }),
    },
    Pressable: host('button'),
    ScrollView: host('div'),
    StyleSheet,
    Text: host('span'),
    View: host('div'),
  };
});

describe('MenuScreen', () => {
  beforeEach(() => mocks.push.mockReset());
  afterEach(cleanup);

  it('opens bookmarks, settings and about', () => {
    render(<MenuScreen />);

    // The three destinations the tab bar gave up a slot for. A missing row
    // here is a screen the user can no longer reach at all.
    for (const [icon, href] of [
      ['bookmark', '/bookmarks'],
      ['settings', '/settings'],
      ['info', '/about'],
    ]) {
      fireEvent.click(screen.getByTestId(`menu-row-${icon}`));
      expect(mocks.push).toHaveBeenLastCalledWith(href);
    }
  });

  it('names each row with what is behind it', () => {
    render(<MenuScreen />);

    // Label, not hint: TalkBack reads a hint only after a pause, so a row that
    // announces as the bare word "Settings" says nothing about what is inside.
    expect(screen.getByTestId('menu-row-settings').getAttribute('aria-label')).toBe(
      'Settings. Reading, recitation, appearance, language',
    );
  });

  it('reads the version from the app config', () => {
    render(<MenuScreen />);

    // Asserted against the mocked config rather than a literal: this line
    // exists to be quoted back in a bug report, and a hardcoded version is
    // wrong one release after it is typed.
    expect(screen.getByTestId('app-version').textContent).toBe('Quran Corpus 1.2.3');
  });
});
