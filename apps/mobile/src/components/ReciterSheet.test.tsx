import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RECITERS } from '@quran-corpus/data/mobile';
import { ReciterSheet } from './ReciterSheet';

// The shell has its own suite. Stubbed here so this one covers the wiring --
// which reciter is announced checked, what a pick does -- without pulling
// reanimated and gesture-handler into it.
vi.mock('./BottomSheet', async () => {
  const React = await import('react');
  return {
    BottomSheet: ({ onClose, closeLabel, children }: {
      onClose: () => void;
      closeLabel: string;
      children: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'sheet', 'data-close-label': closeLabel },
        React.createElement('button', { 'data-testid': 'close-sheet', onClick: onClose }),
        children,
      ),
  };
});

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return {
    // Reached through useReducedMotion, which SheetRow's press-scale style
    // calls on every render.
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => {} }),
    },
    Pressable: host('button'),
    ScrollView: host('div'),
    Text: host('span'),
    View: host('div'),
  };
});

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ reduceMotion: false }),
}));

const props = {
  current: 'husary',
  uiLocale: 'en' as const,
  onSelect: () => {},
  onClose: () => {},
};

describe('ReciterSheet', () => {
  afterEach(cleanup);

  it('lists every reciter with the current one marked', () => {
    render(<ReciterSheet {...props} current="sudais" />);

    expect(screen.getAllByRole('radio')).toHaveLength(RECITERS.length);
    expect(screen.getByLabelText(/As-Sudais/).getAttribute('aria-checked')).toBe('true');
  });

  it('marks exactly one reciter', () => {
    // Two marked options is what a `!==` in the comparison looks like, and the
    // sheet would still render ten rows.
    render(<ReciterSheet {...props} current="sudais" />);

    const checked = screen
      .getAllByRole('radio')
      .filter((option) => option.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
  });

  it('never lists Alafasy', () => {
    // Owner ruling, umbrella decision 37. He is the default in most Quran apps
    // and in the mockup, so this is exactly the entry a later edit adds back.
    render(<ReciterSheet {...props} />);

    expect(screen.queryByText(/afasy/i)).toBeNull();
  });

  it('reports the pick and closes itself in one tap', () => {
    // Both, not just onSelect: leaving the sheet open means the user has to
    // dismiss it to hear the reciter they just chose.
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ReciterSheet {...props} onSelect={onSelect} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText(/As-Sudais/));

    expect(onSelect).toHaveBeenCalledWith('sudais');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not re-report the reciter that is already playing', () => {
    // A no-op write restarts nothing, but it does re-render the reader and
    // re-run the settings write path for a value that has not changed.
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ReciterSheet {...props} current="husary" onSelect={onSelect} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText(/Al-Husary \(Murattal\)/));

    expect(onSelect).not.toHaveBeenCalled();
    // Still closes -- tapping the active reciter is a "yes, that one" gesture.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names its own backdrop rather than leaving the shell to guess', () => {
    render(<ReciterSheet {...props} />);

    expect(screen.getByTestId('sheet').getAttribute('data-close-label')).toBe('Close');
  });

  it('gives every reciter a 48dp touch target', () => {
    // Ten rows in a sheet: the one screen in the app where a cramped list is
    // most tempting.
    render(<ReciterSheet {...props} />);

    for (const option of screen.getAllByRole('radio')) {
      expect(Number(option.style.minHeight.replace('px', ''))).toBeGreaterThanOrEqual(48);
    }
  });

  it('heads the sheet so the list is not ten unexplained names', () => {
    render(<ReciterSheet {...props} />);

    expect(screen.getByText('Choose reciter')).toBeTruthy();
  });

  it('marks the active reciter with a check, not a text bullet', () => {
    // Brief names 'abdulbasit-murattal'; RECITERS' real id is 'abdul-basit'
    // (packages/data/src/audio.ts) -- using the id that actually exists so
    // this asserts a real selected row, not a no-op against zero matches.
    render(<ReciterSheet {...props} current="abdul-basit" />);
    // The bullets were literal ● / ○ characters in a Text run, beside an SVG
    // icon set that has had a check since M6j task 1.
    expect(screen.queryByText(/●|○/)).toBeNull();
    expect(screen.getByTestId('icon-check')).toBeTruthy();
  });
});
