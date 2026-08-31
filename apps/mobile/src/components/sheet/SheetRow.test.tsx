import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SheetRow } from './SheetRow';

// react-native itself does not run under jsdom; every suite that renders a
// host component maps it through rnHosts, same as SheetHeader.test.tsx and
// BrowseList.test.tsx.
vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({ text: '#111', accent: '#1f6f5b', accentWash: '#e0e8e1', mutedText: '#777' }),
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ reduceMotion: false }) }));

afterEach(cleanup);

describe('SheetRow', () => {
  it('is a radio that reports its selection when it is a choice', () => {
    render(<SheetRow label="Abdul Basit" role="radio" selected onPress={() => {}} testID="r" />);
    const row = screen.getByTestId('r');
    // aria-selected is what tells a screen reader "6 of 10" instead of leaving
    // selection as an afterthought. aria-checked too: the brief's row sets
    // `checked` alongside `selected` because TalkBack reads a radio's state
    // from `checked` on some builds, and a test that only checked
    // `aria-selected` passed with that field deleted (mutation-check).
    expect(row.getAttribute('role')).toBe('radio');
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(row.getAttribute('aria-checked')).toBe('true');
  });

  it('marks the selected row with more than colour', () => {
    // WCAG 1.4.1: accent text alone does not carry "this one is active".
    render(<SheetRow label="Abdul Basit" role="radio" selected onPress={() => {}} testID="r" />);
    expect(screen.getByTestId('icon-check')).toBeTruthy();
  });

  it('draws no check on an unselected row', () => {
    render(<SheetRow label="As-Sudais" role="radio" onPress={() => {}} testID="r" />);
    expect(screen.queryByTestId('icon-check')).toBeNull();
  });

  it('keeps the 48dp floor', () => {
    render(<SheetRow label="As-Sudais" onPress={() => {}} testID="r" />);
    expect(screen.getByTestId('r').style.minHeight).toBe('48px');
  });

  it('names only the label, not the decoration', () => {
    render(<SheetRow label="Abdul Basit" role="radio" selected onPress={() => {}} testID="r" />);
    expect(screen.getByTestId('r').getAttribute('aria-label')).toBe('Abdul Basit');
  });

  it('calls back when tapped', () => {
    const onPress = vi.fn();
    render(<SheetRow label="As-Sudais" onPress={onPress} testID="r" />);
    fireEvent.click(screen.getByTestId('r'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
