import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const React = await import('react');
  const { reactNativeTextMock, host } = await import('@/testing/rnHosts.js');
  return {
    ...reactNativeTextMock(),
    TextInput: ({ value, onChangeText, testID, accessibilityLabel }: Record<string, unknown>) =>
      React.createElement('input', {
        'data-testid': testID,
        'aria-label': accessibilityLabel,
        value: value as string,
        onChange: (event: { target: { value: string } }) =>
          (onChangeText as (next: string) => void)(event.target.value),
      }),
    Modal: host('div'),
  };
});
vi.mock('@/components/BottomSheet', async () => {
  return { BottomSheet: ({ children }: { children: unknown }) => children };
});
// The store opens expo-secure-store, which jsdom has no counterpart for, and
// usePressScale reads it through useReducedMotion.
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }),
}));

import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

import { PageJumpSheet, parseJumpTarget } from './PageJumpSheet';

function renderSheet(onJump = vi.fn()) {
  render(
    <ThemeContext.Provider value={themeColors.light}>
      <PageJumpSheet uiLocale="en" onClose={vi.fn()} onJump={onJump} />
    </ThemeContext.Provider>,
  );
  return onJump;
}

afterEach(cleanup);

describe('parseJumpTarget', () => {
  it('takes an integer inside the kind-s range', () => {
    expect(parseJumpTarget('page', '604')).toBe(604);
    expect(parseJumpTarget('surah', '114')).toBe(114);
    expect(parseJumpTarget('juz', '30')).toBe(30);
  });

  it('refuses anything outside it', () => {
    // The mushaf has 604 pages, 114 surahs and 30 juz. getMushafPage validates
    // the page again in packages/data; this is the boundary that has to turn a
    // bad value into a message rather than a thrown error.
    expect(parseJumpTarget('page', '605')).toBeNull();
    expect(parseJumpTarget('page', '0')).toBeNull();
    expect(parseJumpTarget('surah', '115')).toBeNull();
    expect(parseJumpTarget('juz', '31')).toBeNull();
  });

  it('refuses anything that is not a plain integer', () => {
    for (const raw of ['', ' ', '-1', '1.5', '1e3', '12a', '٣', '9999999']) {
      expect(parseJumpTarget('page', raw)).toBeNull();
    }
  });
});

describe('PageJumpSheet', () => {
  it('reports a valid target', () => {
    const onJump = renderSheet();

    fireEvent.change(screen.getByTestId('jump-input'), { target: { value: '106' } });
    fireEvent.click(screen.getByTestId('jump-go'));

    expect(onJump).toHaveBeenCalledWith('page', 106);
  });

  it('refuses a page outside the mushaf, with a message rather than silence', () => {
    const onJump = renderSheet();

    fireEvent.change(screen.getByTestId('jump-input'), { target: { value: '605' } });
    fireEvent.click(screen.getByTestId('jump-go'));

    expect(onJump).not.toHaveBeenCalled();
    expect(screen.getByTestId('jump-error')).toBeTruthy();
  });

  it('clears the number when the kind changes', () => {
    // "5" typed as a page must not be submittable as surah 5 on the next tap.
    const onJump = renderSheet();

    fireEvent.change(screen.getByTestId('jump-input'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Surah'));
    fireEvent.click(screen.getByTestId('jump-go'));

    expect(onJump).not.toHaveBeenCalled();
  });
});
