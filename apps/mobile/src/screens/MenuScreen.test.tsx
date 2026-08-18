import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuScreen } from './MenuScreen';

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en' }),
}));

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Text: host('span'), View: host('div'), ScrollView: host('div') };
});

describe('MenuScreen', () => {
  afterEach(cleanup);

  it('links to bookmarks, settings and about', () => {
    render(<MenuScreen />);

    // The three destinations the tab bar gave up a slot for. A missing row
    // here is a screen the user can no longer reach at all.
    expect(screen.getByText('Bookmarks').closest('a')?.getAttribute('href')).toBe('/bookmarks');
    expect(screen.getByText('Settings').closest('a')?.getAttribute('href')).toBe('/settings');
    expect(screen.getByText('About & credits').closest('a')?.getAttribute('href')).toBe('/about');
  });
});
