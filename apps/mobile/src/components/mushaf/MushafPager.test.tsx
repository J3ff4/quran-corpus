import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

vi.mock('react-native-pager-view', async () => {
  const { pagerViewMock } = await import('@/testing/pagerHost.js');
  return pagerViewMock();
});

const mocks = vi.hoisted(() => ({ pageProps: [] as Array<Record<string, unknown>> }));

// Mocked only so the marks the pager hands DOWN are observable: with no client
// the real page has no lines, so nothing it draws can show whether it was
// given the reader's marks or the context's empty default.
vi.mock('./MushafPage', async () => {
  const React = await import('react');
  return {
    MushafPage: (props: Record<string, unknown>) => {
      mocks.pageProps.push(props);
      return React.createElement('div', { 'data-testid': 'page' });
    },
  };
});

// The page draws through expo-font, which dies at import under jsdom.
vi.mock('@/mushaf/pageFont', () => ({
  useMushafPageFont: () => ({ family: 'QCF2106', ready: false, error: null }),
  mushafFontFamily: (page: number) => `QCF2${String(page).padStart(3, '0')}`,
}));

import { pagerCommandsOf, pagerPropsOf } from '@/testing/pagerHost';
import { HighlightsProvider } from '@/mushaf/highlightsContext';
import { MUSHAF_PAGE_MAX, MUSHAF_PAGE_MIN } from '@quran-corpus/data/mobile';

import { MushafPager, WINDOW } from './MushafPager';

/** The reader's marks at one step of the landing pulse. */
const marks = (landingProgress: number) => ({
  bookmarked: new Set<string>(),
  landing: '2:255',
  playing: null,
  landingProgress,
  pressed: null,
});

afterEach(() => {
  cleanup();
  mocks.pageProps = [];
});

const props = {
  client: null,
  initialPage: 106,
  width: 360,
  height: 720,
  ayahTexts: new Map<string, string>(),
  surahNames: new Map<number, string>(),
  juzByPage: new Map<number, number>(),
  uiLocale: 'en' as const,
  onPageChange: vi.fn(),
  onWordLongPress: vi.fn(),
  onTap: vi.fn(),
};

/** The event ViewPager2 emits when a turn settles. Zero-based, unlike a page. */
const selected = (page: number) => ({ nativeEvent: { position: page - 1 } });

/** Fires a settle through React, so the window state it sets is committed. */
const settle = (
  result: { container: { querySelectorAll(s: string): ArrayLike<object> } },
  page: number,
) => {
  act(() => {
    pagerPropsOf(result).onPageSelected?.(selected(page));
  });
};

/** How many cells are drawing a page rather than sitting empty.
 *
 *  Read off the child tree rather than the DOM: the cells that draw nothing
 *  render an empty View, and the ones that draw hand off to a Pressable whose
 *  testID the react-native shim does not forward to an attribute. */
const drawnPages = (result: { container: { querySelectorAll(s: string): ArrayLike<object> } }) =>
  React.Children.toArray(pagerPropsOf(result).children as React.ReactNode).filter(
    (cell) => (cell as { props: { children: unknown } }).props.children !== null,
  ).length;

describe('MushafPager', () => {
  it('spans exactly the 604 pages of the mushaf', () => {
    const pager = pagerPropsOf(render(<MushafPager {...props} />));
    expect(React.Children.count(pager.children)).toBe(604);
  });

  it('starts on the page it was given', () => {
    const pager = pagerPropsOf(render(<MushafPager {...props} />));
    expect(pager.initialPage).toBe(105); // page 106, zero-based
  });

  it('opens on a real page when handed one outside the mushaf', () => {
    // The number arrives from a route param and the user DB. ViewPager2 does
    // not bounds-check it: an index past the children lands on a blank page.
    expect(pagerPropsOf(render(<MushafPager {...props} initialPage={0} />)).initialPage).toBe(0);
    expect(pagerPropsOf(render(<MushafPager {...props} initialPage={999} />)).initialPage).toBe(603);
  });

  it('turns right to left, like the book', () => {
    // Ruling 7. layoutDirection on the pager, NOT I18nManager.forceRTL, which
    // flips every screen in the app -- the UI locale is a separate user
    // setting from the mushaf's reading direction.
    expect(pagerPropsOf(render(<MushafPager {...props} />)).layoutDirection).toBe('rtl');
  });

  it('does not rubber-band past the first or last page', () => {
    // The mushaf has no cover to pull open, and the stretch reads as a page
    // that failed to turn. It must be overScrollMode, NOT `overdrag={false}`:
    // that prop's Android setter is a bare `return` in 8.0.2, so it reads as
    // this fix while leaving the stretch exactly where it was.
    const pager = pagerPropsOf(render(<MushafPager {...props} />));
    expect(pager.overScrollMode).toBe('never');
    expect(pager.overdrag).toBeUndefined();
  });

  it('draws only a narrow window of pages, and moves it with the reader', () => {
    // The pager does NOT virtualize: every child it is handed renders. 604
    // live queries, and a ~200KB font per drawn page that expo-font never
    // unloads, is what this window exists to prevent -- so the cells all exist
    // (ViewPager2 pages by child index) but only three draw anything.
    const result = render(<MushafPager {...props} />);
    expect(drawnPages(result)).toBe(2 * WINDOW + 1);

    settle(result, 400);
    expect(drawnPages(result)).toBe(2 * WINDOW + 1);
  });

  it('keeps the native offscreen limit in step with the drawn window', () => {
    // A native limit wider than the drawn window pages onto a blank cell.
    expect(pagerPropsOf(render(<MushafPager {...props} />)).offscreenPageLimit).toBe(WINDOW);
  });

  it('reports the settled page', () => {
    const onPageChange = vi.fn();
    const result = render(<MushafPager {...props} onPageChange={onPageChange} />);
    settle(result, 107);
    expect(onPageChange).toHaveBeenCalledWith(107);
  });

  it('reports a page turn exactly once per settle', () => {
    // This is the write point for the durable reading position (ruling 15).
    // Android also fires onPageSelected once at mount with the initial page,
    // which must not be reported as a turn.
    const onPageChange = vi.fn();
    const result = render(<MushafPager {...props} onPageChange={onPageChange} />);
    settle(result, 106);
    settle(result, 107);
    settle(result, 107);
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(107);
  });

  it('turns to the page the recitation has moved onto', () => {
    // Ruling 19. Without this the audio tint moves onto a page the reader is
    // not looking at, and the mushaf silently stops following the recitation.
    const result = render(<MushafPager {...props} focusPage={null} />);
    expect(pagerCommandsOf(result)).toEqual([]);

    result.rerender(<MushafPager {...props} focusPage={108} />);
    expect(pagerCommandsOf(result)).toEqual([{ page: 107, animated: true }]);
  });

  it('does not turn to the page it is already on', () => {
    // The recitation crossing ayahs within one page reports the same page
    // every time; turning on each would fight a reader mid-swipe.
    expect(pagerCommandsOf(render(<MushafPager {...props} focusPage={106} />))).toEqual([]);
  });

  it('ignores a focus page outside the mushaf', () => {
    expect(pagerCommandsOf(render(<MushafPager {...props} focusPage={605} />))).toEqual([]);
    expect(pagerCommandsOf(render(<MushafPager {...props} focusPage={0} />))).toEqual([]);
  });

  it('reports the page an auto-turn settles on', () => {
    // The turn was not the reader's, but the page they are now on is still
    // the page the reading position has to remember (ruling 15).
    const onPageChange = vi.fn();
    const result = render(
      <MushafPager {...props} focusPage={108} onPageChange={onPageChange} />,
    );
    settle(result, 108);
    expect(onPageChange).toHaveBeenCalledWith(108);
  });

  it('memoises a page, so a chrome toggle two levels up does not redraw three', () => {
    // Every prop a page takes is a stable reference from the reader. Without
    // the memo one boolean -- the chrome's visibility -- re-rendered all three
    // drawn pages, and a page render invalidates the hardware layer it is held
    // in, so a 220ms slide competed with three full rasterisations.
    const pager = pagerPropsOf(render(<MushafPager {...props} />));
    const cell = React.Children.toArray(pager.children)[105] as {
      props: { children: { type: { $$typeof?: symbol } } };
    };

    expect(cell.props.children.type.$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('keeps every cell in the tree, even when it draws nothing', () => {
    // ViewPager2 pages by child index: a cell that is not handed over shifts
    // every page after it, so page 300 would no longer be page 300.
    const pager = pagerPropsOf(render(<MushafPager {...props} />));
    const cells = React.Children.toArray(pager.children) as {
      props: { children: unknown };
    }[];

    expect(cells).toHaveLength(MUSHAF_PAGE_MAX - MUSHAF_PAGE_MIN + 1);
    expect(cells[0]!.props.children).toBeNull();
  });

  it('does not re-render when only the marks change', () => {
    // The pager hands PagerView all 604 children and PagerView is a plain
    // React.Component, so one of its renders is a Children.map + cloneElement
    // over every one of them. The landing pulse alone steps six times in
    // ~900ms. The marks therefore travel by context, and the pager is memoised
    // -- which only holds while no often-changing prop is passed to it.
    const result = render(
      <HighlightsProvider value={marks(0)}>
        <MushafPager {...props} />
      </HighlightsProvider>,
    );
    const before = pagerPropsOf(result).children;

    result.rerender(
      <HighlightsProvider value={marks(0.6)}>
        <MushafPager {...props} />
      </HighlightsProvider>,
    );

    // Same element array object: the pager never re-ran, so nothing rebuilt
    // the 604 cells.
    expect(pagerPropsOf(result).children).toBe(before);
  });

  it('hands the reader marks down to the pages that draw', () => {
    // The other half of the context move: the pager stops re-rendering, so the
    // ONLY path left from the reader's marks to a drawn page runs through
    // PagerPage's useHighlights. Lose that and every page draws unmarked --
    // no bookmark band, no landing pulse, no playing ayah -- while the pager's
    // own props still look exactly right.
    render(
      <HighlightsProvider value={marks(0.6)}>
        <MushafPager {...props} />
      </HighlightsProvider>,
    );

    expect(mocks.pageProps).not.toHaveLength(0);
    for (const page of mocks.pageProps) {
      expect(page['highlights']).toMatchObject({ landing: '2:255', landingProgress: 0.6 });
    }
  });

  it('clamps a page that is not a whole number in range', () => {
    // initialPage reaches a native Int32 prop, and Math.min(Math.max(NaN)) is
    // NaN -- which the range-only clamp let straight through.
    expect(pagerPropsOf(render(<MushafPager {...props} initialPage={NaN} />)).initialPage).toBe(0);
    expect(pagerPropsOf(render(<MushafPager {...props} initialPage={9000} />)).initialPage).toBe(
      MUSHAF_PAGE_MAX - 1,
    );
  });
});
