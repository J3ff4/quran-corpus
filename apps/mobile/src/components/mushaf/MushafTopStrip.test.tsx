import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

import { MushafTopStrip } from './MushafTopStrip';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function renderStrip(props: Partial<React.ComponentProps<typeof MushafTopStrip>> = {}) {
  const onTap = vi.fn();
  render(
    <ThemeContext.Provider value={themeColors.dark}>
      <MushafTopStrip
        insetTop={28}
        surahName="Al-Maidah"
        juz={6}
        uiLocale="en"
        onTap={onTap}
        {...props}
      />
    </ThemeContext.Provider>,
  );
  return onTap;
}

afterEach(cleanup);

describe('MushafTopStrip', () => {
  it('names the page: the surah it opens with, and its juz', () => {
    renderStrip();

    expect(screen.getByText('Al-Maidah')).toBeTruthy();
    expect(screen.getByText('Juz 6')).toBeTruthy();
  });

  it('prints no juz at all before the index resolves', () => {
    // Not an empty <Text> carrying a label either: gated only on the visible
    // string, TalkBack announced "Juz 0" on a row showing nothing.
    renderStrip({ juz: 0 });

    expect(screen.queryByTestId('page-juz')).toBeNull();
  });

  it('toggles the chrome from a tap on the band', () => {
    // The row it took over used to sit inside the page's own Pressable. Left
    // inert, the top of the screen is a dead zone -- and with the chrome down
    // that is a place the chrome cannot be brought back from.
    const onTap = renderStrip();

    fireEvent.click(screen.getByTestId('mushaf-top-strip'));

    expect(onTap).toHaveBeenCalled();
  });

  it('paints the page-s own ground, so there is no seam above the leaf', () => {
    // The whole reason it exists: the tabs layout pads every scene clear of
    // the status bar, and on this tab that padding showed the app bloom.
    renderStrip();

    const strip = screen.getByTestId('mushaf-top-strip');
    // jsdom normalises the hex to rgb(); compare through the same conversion
    // rather than against the token's literal spelling.
    const hex = themeColors.dark.background;
    const rgb = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ');
    expect(strip.style.backgroundColor).toBe(`rgb(${rgb})`);
    expect(strip.style.paddingTop).toBe('28px');
  });
});
