import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

import { KhatmRibbon, khatmRibbonTranslateY } from './KhatmRibbon';
import { rgb } from '@/testing/rgb';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function renderRibbon(props: Partial<React.ComponentProps<typeof KhatmRibbon>> = {}) {
  return render(
    <ThemeContext.Provider value={themeColors.light}>
      <KhatmRibbon marked reduceMotion={false} {...props} />
    </ThemeContext.Provider>,
  );
}

afterEach(cleanup);

describe('KhatmRibbon', () => {
  it('draws nothing on an unmarked page', () => {
    // R-C2: paper is clean at rest. A faint stub on all 604 pages is 604
    // pieces of furniture on the one surface this design treats as paper.
    renderRibbon({ marked: false });
    expect(screen.queryByTestId('khatm-ribbon')).toBeNull();
  });

  it('draws the ribbon on the marked page in the ribbon colour', () => {
    // The colour is its own token, not `danger` reused: the two are nearly the
    // same red and a lazy alias would track whichever one someone edits next.
    renderRibbon();
    const ribbon = screen.getByTestId('khatm-ribbon');
    const strip = ribbon.firstElementChild as HTMLElement;
    expect(strip.style.backgroundColor).toBe(rgb(themeColors.light.ribbon));
  });

  it('hangs from the top leading corner', () => {
    // R-C7: top-LEFT, as asked. A deliberate override -- a mushaf's spine is
    // on the right, so a physical ribbon would hang top-right.
    renderRibbon();
    const ribbon = screen.getByTestId('khatm-ribbon');
    expect(ribbon.style.position).toBe('absolute');
    expect(ribbon.style.top).toBe('0px');
    expect(ribbon.style.left).toBe('0px');
  });

  it('appears without animating under reduced motion', () => {
    // CLAUDE.md §8. The mark is the function; the drop is the flourish.
    renderRibbon({ reduceMotion: true });
    expect(screen.getByTestId('khatm-ribbon').style.transform).toBe('');
  });

  it('does not take the tap that toggles the chrome', () => {
    // The page's Pressable is an ANCESTOR of this view, so a touch the ribbon
    // claimed would never reach it -- the chrome would simply stop responding
    // in the one corner the ribbon covers.
    renderRibbon();
    expect(screen.getByTestId('khatm-ribbon').getAttribute('data-pointer-events')).toBe('none');
  });

  it('is not an accessibility node of its own', () => {
    // Decoration for state the chrome button already announces in words. The
    // prop is importantForAccessibility, NOT `accessible` -- that one hides a
    // view's children from TalkBack, and no unit test here can see it.
    renderRibbon();
    expect(screen.getByTestId('khatm-ribbon').getAttribute('data-hidden-from-a11y')).toBe('true');
  });

  it('drops downward into its resting place', () => {
    // Asserted on the pure function, not the rendered view: the Reanimated
    // shim resolves withTiming straight to its target, so a component test
    // only ever sees the settled frame and could not tell a drop from a rise.
    expect(khatmRibbonTranslateY(0)).toBeLessThan(0);
    expect(khatmRibbonTranslateY(1)).toBe(0);
  });
});
