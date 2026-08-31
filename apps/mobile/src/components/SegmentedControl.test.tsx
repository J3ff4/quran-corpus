import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// usePressScale -> useReducedMotion reads the in-app setting as well as the
// system one; the real store opens expo-secure-store, which jsdom has no
// counterpart for.
const settings = vi.hoisted(() => ({ reduceMotion: false }));
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', reduceMotion: settings.reduceMotion }),
}));

import { SegmentedControl } from './SegmentedControl';
import { PILL_SETTLE_MS } from '@/motion/segmentedPill';
import { setAutoLayout } from '@/testing/rnHosts';
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

/**
 * The press path a real user takes, which needs a measured row.
 *
 * Without setAutoLayout the control never learns its width, and every press
 * takes the unmeasured path -- which applies the change straight away. The
 * whole deferral below was untested behind a green suite until the shim could
 * report a box (2026-08-31).
 */
describe('SegmentedControl on a measured row', () => {
  beforeEach(() => {
    setAutoLayout({ width: 320, height: 44 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    setAutoLayout(null);
    settings.reduceMotion = false;
    cleanup();
  });

  it('holds the change back until the pill has landed', () => {
    // The measured reason for the delay: applying on press puts the caller's
    // re-render inside the spring's opening frames, and both run on the UI
    // thread. See PILL_SETTLE_MS.
    const onChange = renderControl('surah');

    fireEvent.click(screen.getAllByRole('tab')[2]!);
    expect(onChange).not.toHaveBeenCalled();

    // Still held one tick short of the settle time, so this pins the delay
    // rather than merely "some timer somewhere".
    act(() => {
      vi.advanceTimersByTime(PILL_SETTLE_MS - 1);
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenCalledWith('page');
  });

  it('moves the selection to the pressed segment while the change is held', () => {
    // Otherwise the wash arrives under a segment still styled unselected while
    // the one it left stays bold, and the selection reads as being in two
    // places for the length of the travel.
    renderControl('surah');

    fireEvent.click(screen.getAllByRole('tab')[2]!);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
    expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('applies a tab mash once, at the last segment pressed', () => {
    const onChange = renderControl('surah');

    fireEvent.click(screen.getAllByRole('tab')[1]!);
    act(() => {
      vi.advanceTimersByTime(PILL_SETTLE_MS - 60);
    });
    fireEvent.click(screen.getAllByRole('tab')[3]!);
    act(() => {
      vi.advanceTimersByTime(PILL_SETTLE_MS);
    });

    // One query, not two: the caller reloads on every change, and the juz list
    // the user passed through is not one they asked to see.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('revealed');
  });

  it('drops a held change when the control goes away', () => {
    // Firing at a parent that has unmounted sets state on a dead screen, and
    // the mode it would apply is one the user navigated off before it landed.
    const onChange = vi.fn();
    const view = render(
      <ThemeContext.Provider value={themeColors.dark}>
        <SegmentedControl options={OPTS} value="surah" onChange={onChange} accessibilityLabel="Browse by" />
      </ThemeContext.Provider>,
    );

    fireEvent.click(screen.getAllByRole('tab')[2]!);
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(PILL_SETTLE_MS * 2);
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies straight away when motion is reduced', () => {
    // Nothing is travelling, so there is no travel to protect -- and holding
    // content back from someone who asked for less motion buys them nothing.
    settings.reduceMotion = true;
    const onChange = renderControl('surah');

    fireEvent.click(screen.getAllByRole('tab')[2]!);

    expect(onChange).toHaveBeenCalledWith('page');
  });
});
