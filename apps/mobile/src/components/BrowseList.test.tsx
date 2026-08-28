import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowseList, type BrowseItem } from './BrowseList';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// The rows squeeze on press, so they reach usePressScale -> useReducedMotion,
// which reads the in-app setting; the real store opens expo-secure-store.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

function item(overrides: Partial<BrowseItem> = {}): BrowseItem {
  return {
    key: 'juz-1',
    leading: '1',
    title: 'Juz 1',
    accessibilityLabel: 'Juz 1',
    onPress: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe('BrowseList disclosure rows', () => {
  it('draws no chevron on a row that is not a disclosure', () => {
    render(<BrowseList items={[item()]} />);

    expect(screen.queryByTestId('browse-chevron-juz-1')).toBeNull();
  });

  it('points the chevron down when the row is expanded and right when it is not', () => {
    const { rerender } = render(<BrowseList items={[item({ expanded: false })]} />);
    expect(screen.getByTestId('browse-chevron-juz-1-chevronRight')).toBeTruthy();

    rerender(<BrowseList items={[item({ expanded: true })]} />);
    expect(screen.getByTestId('browse-chevron-juz-1-chevronDown')).toBeTruthy();
  });

  it('announces the disclosure state to a screen reader', () => {
    render(<BrowseList items={[item({ expanded: false })]} />);

    // Without this a chevron is decoration: TalkBack reads the row as a plain
    // button and never says the ranges under it exist.
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves aria-expanded off a row that opens something', () => {
    render(<BrowseList items={[item()]} />);

    // A surah row navigates; announcing it as collapsed would promise a
    // disclosure that is not there.
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBeNull();
  });
});

describe('BrowseList collapsible sections', () => {
  const section = {
    title: 'Meccan',
    count: 2,
    data: [item({ key: 'a', title: 'Al-Alaq', accessibilityLabel: 'Al-Alaq' })],
  };

  it('renders a plain header when the section is not collapsible', () => {
    render(<BrowseList sections={[{ title: 'Meccan', data: section.data }]} />);

    expect(screen.getByText('Al-Alaq')).toBeTruthy();
    expect(screen.queryByTestId('browse-section-Meccan')).toBeNull();
  });

  it('shows the count and toggles on press', () => {
    const onToggle = vi.fn();
    render(<BrowseList sections={[{ ...section, expanded: true, onToggle }]} />);

    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.click(screen.getByTestId('browse-section-Meccan'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no rows while the section is collapsed', () => {
    render(<BrowseList sections={[{ ...section, expanded: false, onToggle: vi.fn() }]} />);

    // The header survives its own collapse, or there is nothing to reopen.
    expect(screen.getByTestId('browse-section-Meccan')).toBeTruthy();
    expect(screen.queryByText('Al-Alaq')).toBeNull();
  });

  it('announces the section state to a screen reader', () => {
    render(<BrowseList sections={[{ ...section, expanded: false, onToggle: vi.fn() }]} />);

    expect(screen.getByTestId('browse-section-Meccan').getAttribute('aria-expanded')).toBe('false');
  });
});
