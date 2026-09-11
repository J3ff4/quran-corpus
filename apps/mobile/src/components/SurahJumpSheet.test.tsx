import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const React = await import('react');
  const { reactNativeTextMock, host } = await import('@/testing/rnHosts.js');
  return {
    ...reactNativeTextMock(),
    TextInput: ({
      value,
      onChangeText,
      testID,
      accessibilityLabel,
      editable,
    }: Record<string, unknown>) =>
      React.createElement('input', {
        'data-testid': testID,
        'aria-label': accessibilityLabel,
        disabled: editable === false,
        value: value as string,
        onChange: (event: { target: { value: string } }) =>
          (onChangeText as (next: string) => void)(event.target.value),
      }),
    Modal: host('div'),
  };
});
vi.mock('@/components/BottomSheet', () => ({
  BottomSheet: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }),
}));

import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

import { SurahJumpSheet, parseSurahJump } from './SurahJumpSheet';

function renderSheet(options: { ayahCountOf?: (surahId: number) => number | null } = {}) {
  const onJump = vi.fn();
  render(
    <ThemeContext.Provider value={themeColors.light}>
      <SurahJumpSheet
        uiLocale="en"
        surahId={1}
        ayahCountOf={options.ayahCountOf ?? (() => 7)}
        onClose={vi.fn()}
        onJump={onJump}
      />
    </ThemeContext.Provider>,
  );
  return onJump;
}

const type = (testID: string, value: string) =>
  fireEvent.change(screen.getByTestId(testID), { target: { value } });

afterEach(cleanup);

describe('parseSurahJump', () => {
  it('takes an integer inside the range', () => {
    expect(parseSurahJump('7', 114)).toBe(7);
    expect(parseSurahJump(' 7 ', 114)).toBe(7);
  });

  it('rejects everything that is not one', () => {
    // Every one of these reaches a query if it passes: a decimal, a sign, a
    // number past the end, empty, and a numeral the parser must not coerce.
    for (const raw of ['', ' ', '0', '115', '7.5', '-7', '+7', '٧', '7a', '1e2']) {
      expect(parseSurahJump(raw, 114)).toBeNull();
    }
  });

  it('takes its ceiling from the surah, not from a constant', () => {
    // al-Fatihah has 7 ayahs and al-Baqarah 286. One constant would either
    // reject 8:1-s real ayahs or accept 1:200.
    expect(parseSurahJump('8', 7)).toBeNull();
    expect(parseSurahJump('8', 286)).toBe(8);
  });
});

describe('SurahJumpSheet', () => {
  it('opens on the surah the reader is already in', () => {
    renderSheet();
    expect((screen.getByTestId('surah-jump-input') as HTMLInputElement).value).toBe('1');
    expect((screen.getByTestId('ayah-jump-input') as HTMLInputElement).value).toBe('1');
  });

  it('hands a valid pair on', () => {
    const onJump = renderSheet({ ayahCountOf: () => 286 });
    type('surah-jump-input', '2');
    type('ayah-jump-input', '255');
    fireEvent.click(screen.getByTestId('surah-jump-go'));
    expect(onJump).toHaveBeenCalledWith(2, 255);
    expect(screen.queryByTestId('surah-jump-error')).toBeNull();
  });

  it('refuses an ayah past the end of the surah', () => {
    // 1:8 does not exist. Passing it on would query a row that is not there
    // and land the reader on a blank screen.
    const onJump = renderSheet({ ayahCountOf: () => 7 });
    type('ayah-jump-input', '8');
    fireEvent.click(screen.getByTestId('surah-jump-go'));
    expect(onJump).not.toHaveBeenCalled();
    expect(screen.getByTestId('surah-jump-error')).toBeTruthy();
  });

  it('refuses a surah past 114', () => {
    const onJump = renderSheet();
    type('surah-jump-input', '115');
    fireEvent.click(screen.getByTestId('surah-jump-go'));
    expect(onJump).not.toHaveBeenCalled();
    expect(screen.getByTestId('surah-jump-error')).toBeTruthy();
  });

  it('takes the ceiling of the surah being typed, not of the one opened on', () => {
    // Seeded on surah 1 (7 ayahs); typing 2 has to raise the ceiling to 286
    // before the ayah is checked, or every jump past al-Fatihah is rejected.
    const onJump = renderSheet({ ayahCountOf: (id) => (id === 1 ? 7 : 286) });
    type('surah-jump-input', '2');
    type('ayah-jump-input', '255');
    fireEvent.click(screen.getByTestId('surah-jump-go'));
    expect(onJump).toHaveBeenCalledWith(2, 255);
  });

  it('leaves the ayah field alone until the counts have loaded', () => {
    // Null is "not loaded yet", not "no ayahs": validating against a guess
    // would reject every real ayah for as long as the read takes.
    renderSheet({ ayahCountOf: () => null });
    expect((screen.getByTestId('ayah-jump-input') as HTMLInputElement).disabled).toBe(true);
  });

  it('still jumps by surah alone while the counts are missing', () => {
    const onJump = renderSheet({ ayahCountOf: () => null });
    type('surah-jump-input', '9');
    fireEvent.click(screen.getByTestId('surah-jump-go'));
    expect(onJump).toHaveBeenCalledWith(9, 1);
  });
});
