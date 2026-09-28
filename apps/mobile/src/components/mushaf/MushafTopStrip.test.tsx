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
  return { onTap };
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
    const { onTap } = renderStrip();

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

  it('grows the name to the row instead of shrinking it to the text', () => {
    // Under `flexShrink: 1` the box came from the text's own measurement, and
    // Android keeps that across a window reconfiguration -- a Fold opened with
    // the app running showed "Al-Baqa..." on a 939dp screen (2026-09-27 fold
    // sweep, reproduced again on vc69 after a remount-based fix held at 896dp
    // but not 939dp). Growing takes the box from the row's layout instead.
    renderStrip();

    // flex-basis is the load-bearing half: at 0 the box starts from nothing
    // and grows to the free space in the row, so it never derives from the
    // text's measured width the way an `auto` basis under shrink does.
    const name = screen.getByTestId('page-surah-name');
    expect(name.style.flexGrow).toBe('1');
    expect(parseFloat(name.style.flexBasis)).toBe(0);
  });
});
