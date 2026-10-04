import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

import { KHATM_RIBBON_HIDDEN, KhatmRibbon, khatmRibbonTarget } from './KhatmRibbon';
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

function rerenderRibbon(view: ReturnType<typeof renderRibbon>, props: React.ComponentProps<typeof KhatmRibbon>) {
  view.rerender(
    <ThemeContext.Provider value={themeColors.light}>
      <KhatmRibbon {...props} />
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
    const strip = screen.getByTestId('khatm-ribbon-silk').firstElementChild as HTMLElement;
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

  it('clips the silk to the ribbon’s own length', () => {
    // What makes the retract read as going UNDER the page edge rather than
    // sliding up over the strip above it. Without the clip the exit is a
    // ribbon crawling up the chrome.
    const ribbon = renderRibbon().container.querySelector('[data-testid="khatm-ribbon"]') as HTMLElement;
    expect(ribbon.style.overflow).toBe('hidden');
    // The clip is exactly the travel the retract asks for, so a full pull is
    // entirely hidden and not a tail left showing.
    expect(ribbon.style.height).toBe(`${-khatmRibbonTarget(false).offset}px`);
  });

  it('appears without animating under reduced motion', () => {
    // CLAUDE.md §8. The mark is the function; the drop is the flourish.
    renderRibbon({ reduceMotion: true });
    expect(screen.getByTestId('khatm-ribbon-silk').style.transform).toBe('');
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
    expect(KHATM_RIBBON_HIDDEN.offset).toBeLessThan(0);
    expect(KHATM_RIBBON_HIDDEN.fade).toBe(0);
    expect(khatmRibbonTarget(true).offset).toBe(0);
    expect(khatmRibbonTarget(true).fade).toBe(1);
  });

  it('leaves by retracting its whole length, without fading', () => {
    // The owner's call (2026-10-03): the ribbon is PULLED OUT of the book, so
    // the tail has to clear the page's top edge -- a 24dp rise like the drop's
    // own would leave two thirds of it showing. And it must not fade on the
    // way: silk that slides and dissolves at once reads as neither.
    const exit = khatmRibbonTarget(false);
    const drop = KHATM_RIBBON_HIDDEN.offset;
    expect(exit.offset).toBeLessThan(drop);
    expect(exit.fade).toBe(1);
    // Longer than the drop, because it covers more than twice the distance.
    expect(exit.duration).toBeGreaterThan(khatmRibbonTarget(true).duration);
  });

  it('stays on screen while it retracts, then goes', async () => {
    // The defect this exists for: the first version returned null the moment
    // `marked` went false, so the retract animated a value nothing was
    // drawing and a lift looked like the ribbon blinking out.
    const view = renderRibbon();
    rerenderRibbon(view, { marked: false, reduceMotion: false });
    expect(screen.getByTestId('khatm-ribbon')).not.toBeNull();
    // The shim fires withTiming's completion on a microtask, so this spans the
    // retract: present in the frame the mark was lifted, gone once it lands.
    await waitFor(() => expect(screen.queryByTestId('khatm-ribbon')).toBeNull());
  });

  it('goes at once under reduced motion', () => {
    // No animation to wait on, so nothing to keep mounted for.
    const view = render(
      <ThemeContext.Provider value={themeColors.light}>
        <KhatmRibbon marked reduceMotion />
      </ThemeContext.Provider>,
    );
    rerenderRibbon(view, { marked: false, reduceMotion: true });
    expect(screen.queryByTestId('khatm-ribbon')).toBeNull();
  });
});
