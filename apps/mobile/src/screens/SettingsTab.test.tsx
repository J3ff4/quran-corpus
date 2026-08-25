import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsTab from '../../app/settings';

const mocks = vi.hoisted(() => ({
  setArabicScale: vi.fn(),
  setReduceMotion: vi.fn(),
  setReciterId: vi.fn(),
  reduceMotion: false,
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    uiLocale: 'en',
    contentLanguage: 'en',
    theme: 'system',
    analyticsEnabled: true,
    arabicScale: 'large',
    reduceMotion: mocks.reduceMotion,
    reciterId: 'husary',
    setUiLocale: vi.fn(),
    setContentLanguage: vi.fn(),
    setTheme: vi.fn(),
    setAnalyticsEnabled: vi.fn(),
    setArabicScale: mocks.setArabicScale,
    setReduceMotion: mocks.setReduceMotion,
    setReciterId: mocks.setReciterId,
  }),
}));

// The sheet has its own suite. Stubbed here so this one does not pull
// BottomSheet's reanimated and gesture-handler imports into a settings test.
vi.mock('@/components/ReciterSheet', async () => {
  const React = await import('react');
  return {
    ReciterSheet: ({ current, onSelect }: { current: string; onSelect: (id: string) => void }) =>
      React.createElement(
        'div',
        { 'data-testid': 'reciter-sheet', 'data-current': current },
        React.createElement('button', { 'data-testid': 'pick-sudais', onClick: () => onSelect('sudais') }),
      ),
  };
});

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ children }: { children?: React.ReactNode }) => React.createElement('a', null, children),
  };
});

// The shared shim, not a fourth hand-rolled copy: this one predated rnHosts
// and had already drifted -- it dropped testID, and mapped aria-checked off
// `selected` when `checked` was absent, which rnHosts does not need to do
// because ChoiceOption sets both.
vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

describe('SettingsTab', () => {
  beforeEach(() => {
    mocks.setArabicScale.mockClear();
    mocks.setReduceMotion.mockClear();
    mocks.setReciterId.mockClear();
    mocks.reduceMotion = false;
  });

  afterEach(cleanup);

  it('names the stored reciter and opens the picker on it', () => {
    // The row shows a name, not the stored id: 'husary' on a settings screen
    // means nothing to a reader choosing a voice.
    render(<SettingsTab />);
    expect(screen.queryByTestId('reciter-sheet')).toBeNull();
    expect(screen.getByTestId('open-reciters').textContent).toContain('Al-Husary');

    fireEvent.click(screen.getByTestId('open-reciters'));

    expect(screen.getByTestId('reciter-sheet').getAttribute('data-current')).toBe('husary');
    fireEvent.click(screen.getByTestId('pick-sudais'));
    expect(mocks.setReciterId).toHaveBeenCalledWith('sudais');
  });

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

  it('offers reduce animations as its own switch, off by default', () => {
    render(<SettingsTab />);

    // Two switches on this screen now, so the assertion names this one rather
    // than taking whichever comes first.
    expect(screen.getByText('Reduce animations: off')).toBeTruthy();

    fireEvent.click(screen.getByText('Reduce animations: off'));

    expect(mocks.setReduceMotion).toHaveBeenCalledWith(true);
  });

  it('turns reduce animations back off from the on state', () => {
    // The other direction, so a switch hard-wired to `true` cannot pass: the
    // owner has to be able to undo this without restarting the app.
    mocks.reduceMotion = true;
    render(<SettingsTab />);

    fireEvent.click(screen.getByText('Reduce animations: on'));

    expect(mocks.setReduceMotion).toHaveBeenCalledWith(false);
  });
});
