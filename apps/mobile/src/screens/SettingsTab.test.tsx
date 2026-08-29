import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsTab from '../../app/settings';

const mocks = vi.hoisted(() => ({
  setArabicScale: vi.fn(),
  setReduceMotion: vi.fn(),
  setReciterId: vi.fn(),
  setWbwDensity: vi.fn(),
  setContinuousPlay: vi.fn(),
  push: vi.fn(),
  reduceMotion: false,
  continuousPlay: false,
  storageError: null as string | null,
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    uiLocale: 'en',
    contentLanguage: 'en',
    theme: 'system',
    analyticsEnabled: true,
    arabicScale: 'large',
    reduceMotion: mocks.reduceMotion,
    wbwDensity: 'hybrid',
    continuousPlay: mocks.continuousPlay,
    reciterId: 'husary',
    storageError: mocks.storageError,
    setUiLocale: vi.fn(),
    setContentLanguage: vi.fn(),
    setTheme: vi.fn(),
    setAnalyticsEnabled: vi.fn(),
    setArabicScale: mocks.setArabicScale,
    setReduceMotion: mocks.setReduceMotion,
    setWbwDensity: mocks.setWbwDensity,
    setContinuousPlay: mocks.setContinuousPlay,
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

vi.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mocks.push(...args) },
}));

// The shared shim, not a fourth hand-rolled copy: this one predated rnHosts
// and had already drifted -- it dropped testID, and mapped aria-checked off
// `selected` when `checked` was absent, which rnHosts does not need to do
// because ChoiceChip sets both.
vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

describe('SettingsTab', () => {
  beforeEach(() => {
    mocks.setArabicScale.mockClear();
    mocks.setReduceMotion.mockClear();
    mocks.setReciterId.mockClear();
    mocks.setWbwDensity.mockClear();
    mocks.setContinuousPlay.mockClear();
    mocks.push.mockClear();
    mocks.reduceMotion = false;
    mocks.continuousPlay = false;
    mocks.storageError = null;
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

  it('offers every control M6 added', () => {
    render(<SettingsTab />);

    // The three settings the earlier sub-phases shipped with no way to reach
    // them: M6e's density was reader-only, M6f's reciter and continuous play
    // were the recitation bar's alone.
    expect(screen.getByRole('radio', { name: 'Verse' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('toggle-continuous')).toBeTruthy();
    expect(screen.getByTestId('open-reciters')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Dense' }));
    expect(mocks.setWbwDensity).toHaveBeenCalledWith('dense');
  });

  it('reports each switch state where a screen reader can reach it', () => {
    render(<SettingsTab />);

    // aria-checked, not a label that spells the state out: the switch role
    // announces on/off itself, and a label that also said it would be read
    // twice -- and the two could disagree.
    expect(screen.getByTestId('toggle-analytics').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('toggle-reduce-motion').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('toggle-continuous').getAttribute('aria-checked')).toBe('false');
  });

  it('turns continuous play on and back off', () => {
    // Both directions, so a switch hard-wired to `true` cannot pass. This one
    // is stored now rather than held in the reader, so getting it stuck on is
    // a state the user cannot clear by leaving the surah.
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('toggle-continuous'));
    expect(mocks.setContinuousPlay).toHaveBeenCalledWith(true);

    cleanup();
    mocks.continuousPlay = true;
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('toggle-continuous'));
    expect(mocks.setContinuousPlay).toHaveBeenLastCalledWith(false);
  });

  it('turns reduce animations on and back off', () => {
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('toggle-reduce-motion'));
    expect(mocks.setReduceMotion).toHaveBeenCalledWith(true);

    cleanup();
    mocks.reduceMotion = true;
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('toggle-reduce-motion'));
    expect(mocks.setReduceMotion).toHaveBeenLastCalledWith(false);
  });

  it('still surfaces a settings storage failure', () => {
    // Re-asserted because a restyle is exactly when an error branch gets
    // dropped: without it a user changes a setting, watches it apply, restarts,
    // and finds it reverted with nothing having said why.
    mocks.storageError = 'disk full';
    render(<SettingsTab />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Settings cannot be saved right now');
    // Announced, not merely rendered: nothing on this screen takes focus when
    // the store fails, so without the live region TalkBack says nothing at all.
    expect(alert.getAttribute('aria-live')).toBe('polite');
  });

  it('leaves the alert out when storage is healthy', () => {
    render(<SettingsTab />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reaches About from the bottom of the screen', () => {
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('open-about'));

    expect(mocks.push).toHaveBeenCalledWith('/about');
  });
});
