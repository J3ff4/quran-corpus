import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

const mocks = vi.hoisted(() => ({
  settings: { arabicScale: 'medium' as string, setArabicScale: vi.fn() },
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => mocks.settings,
}));

import { ArabicSizeStepper, stepArabicScale } from './ArabicSizeStepper';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function renderStepper(settings: Partial<typeof mocks.settings>) {
  mocks.settings = { arabicScale: 'medium', setArabicScale: vi.fn(), ...settings };
  render(
    <ThemeContext.Provider value={themeColors.light}>
      <ArabicSizeStepper uiLocale="en" />
    </ThemeContext.Provider>,
  );
  return mocks.settings;
}

afterEach(cleanup);

describe('stepArabicScale', () => {
  it('steps up and down through the four steps in order', () => {
    // The order is `arabicScales`' declaration order in tokens.ts, which is
    // the ascending order of its multipliers. Asserted here so a reordering
    // there is caught as a failing test rather than as a stepper that jumps
    // about on the device.
    expect(stepArabicScale('small', 1)).toBe('medium');
    expect(stepArabicScale('medium', 1)).toBe('large');
    expect(stepArabicScale('large', 1)).toBe('xlarge');
    expect(stepArabicScale('xlarge', -1)).toBe('large');
    expect(stepArabicScale('medium', -1)).toBe('small');
  });

  it('clamps at both ends rather than wrapping', () => {
    // Wrapping would take the largest step to the smallest on one more tap,
    // which reads as the control breaking rather than as a limit.
    expect(stepArabicScale('xlarge', 1)).toBe('xlarge');
    expect(stepArabicScale('small', -1)).toBe('small');
  });
});

describe('ArabicSizeStepper', () => {
  it('disables the up control at the largest step', () => {
    // A control that is enabled and does nothing is worse than a disabled one.
    renderStepper({ arabicScale: 'xlarge' });
    expect(screen.getByTestId('arabic-size-up').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('arabic-size-down').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('disables the down control at the smallest step', () => {
    renderStepper({ arabicScale: 'small' });
    expect(screen.getByTestId('arabic-size-down').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('arabic-size-up').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('writes the stepped value to the one setting Settings uses', () => {
    // Two ways in, one stored value. A second key would drift, and the two
    // screens would disagree about the size of the same text.
    const settings = renderStepper({ arabicScale: 'medium' });
    fireEvent.click(screen.getByTestId('arabic-size-up'));
    expect(settings.setArabicScale).toHaveBeenCalledWith('large');
  });

  it('steps down from the same control row', () => {
    const settings = renderStepper({ arabicScale: 'medium' });
    fireEvent.click(screen.getByTestId('arabic-size-down'));
    expect(settings.setArabicScale).toHaveBeenCalledWith('small');
  });

  it('gives both controls a 48dp target', () => {
    renderStepper({ arabicScale: 'medium' });
    for (const id of ['arabic-size-up', 'arabic-size-down']) {
      const node = screen.getByTestId(id);
      expect(Number.parseFloat(node.style.minHeight)).toBeGreaterThanOrEqual(48);
      expect(Number.parseFloat(node.style.minWidth)).toBeGreaterThanOrEqual(48);
    }
  });

  it('announces the current step, not just the controls', () => {
    // Without this TalkBack reads "decrease, increase" and never says where
    // the reader already is.
    renderStepper({ arabicScale: 'large' });
    expect(screen.getByTestId('arabic-size-value').textContent).toBe('Large');
  });

  it('names the step it is on, not a fixed label', () => {
    // The value has to track the setting: a hard-coded label passes the test
    // above and says "Large" at every step.
    renderStepper({ arabicScale: 'small' });
    expect(screen.getByTestId('arabic-size-value').textContent).toBe('Small');
  });
});
