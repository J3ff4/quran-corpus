import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// usePressScale -> useReducedMotion reads the in-app setting as well as the
// system one; the real store opens expo-secure-store, which jsdom has no
// counterpart for.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

import { SegmentedControl } from './SegmentedControl';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

const OPTS = [
  { value: 'surah', label: 'Surah' },
  { value: 'juz', label: 'Juz' },
  { value: 'page', label: 'Page' },
  { value: 'revealed', label: 'Revealed' },
] as const;

function renderControl(value: (typeof OPTS)[number]['value'], onChange = vi.fn()) {
  render(
    <ThemeContext.Provider value={themeColors.dark}>
      <SegmentedControl options={OPTS} value={value} onChange={onChange} accessibilityLabel="Browse by" />
    </ThemeContext.Provider>,
  );
  return onChange;
}

describe('SegmentedControl', () => {
  afterEach(cleanup);

  it('marks exactly one option selected', () => {
    renderControl('juz');

    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('reports the value, not the index', () => {
    // An index-based callback breaks silently the moment an option is inserted,
    // and every screen using this passes the value straight into a query.
    const onChange = renderControl('surah');

    fireEvent.click(screen.getAllByRole('tab')[2]!);

    expect(onChange).toHaveBeenCalledWith('page');
  });

  it('does not fire when the selected option is tapped again', () => {
    const onChange = renderControl('surah');

    fireEvent.click(screen.getAllByRole('tab')[0]!);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('names the group for a screen reader', () => {
    renderControl('surah');

    // On the row, not on each option: four segments each announcing "Browse by"
    // is four swipes of the same words.
    expect(screen.getByLabelText('Browse by')).toBeTruthy();
    expect(screen.getAllByRole('tab').every((tab) => tab.getAttribute('aria-label') === null)).toBe(true);
  });

  it('signals selection by more than colour', () => {
    // WCAG 1.4.1: the accent wash behind the selected segment is the visible
    // cue, but colour alone is not a cue. The label carries weight too.
    renderControl('juz');

    const tabs = screen.getAllByRole('tab');
    const weight = (index: number) => (tabs[index]!.firstElementChild as HTMLElement).style.fontWeight;
    expect(weight(1)).not.toBe(weight(0));
  });
});
