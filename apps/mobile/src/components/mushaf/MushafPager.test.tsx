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

const mocks = vi.hoisted(() => ({
  pageProps: [] as Array<Record<string, unknown>>,
  /** Pages whose QCF font has not arrived. A leaf withholds BOTH halves until
   *  both have settled, so this is how a half-loaded leaf is staged. */
  fontPending: new Set<number>(),
  /** Pages whose font will never arrive. Settled, so they must not hold a leaf. */
  fontFailed: new Set<number>(),
}));

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
  useMushafPageFont: (page: number) => ({
    family: `QCF2${String(page).padStart(3, '0')}`,
    ready: !mocks.fontPending.has(page) && !mocks.fontFailed.has(page),
    error: mocks.fontFailed.has(page) ? new Error(`no font for ${page}`) : null,
  }),
  mushafFontFamily: (page: number) => `QCF2${String(page).padStart(3, '0')}`,
}));

import { pagerCommandsOf, pagerPropsOf, pagerRelayout, pagerTurn } from '@/testing/pagerHost';
import { HighlightsProvider } from '@/mushaf/highlightsContext';
import { MUSHAF_PAGE_MAX, MUSHAF_PAGE_MIN } from '@quran-corpus/data/mobile';

import { mushafLeafFontSize, mushafPageFontSize } from '@/mushaf/pageScale';
import { SPREAD_COUNT } from '@/mushaf/spread';

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
  mocks.fontPending.clear();
  mocks.fontFailed.clear();
});

const props = {
  client: null,
  initialPage: 106,
  width: 360,
  height: 720,
  ayahTexts: new Map<string, string>(),
  surahNames: new Map<number, string>(),
  uiLocale: 'en' as const,
  onPageChange: vi.fn(),
  onWordLongPress: vi.fn(),
  onTap: vi.fn(),
};

/** Fires a whole finger turn through React, so the window state it sets is
 *  committed. The full gesture and not a lone onPageSelected: a bare position
 *  report is what a RELAYOUT emits, and the pager now tells the two apart --
 *  see pagerTurn and issue #107. Zero-based, unlike a page. */
const settle = (
  result: { container: { querySelectorAll(s: string): ArrayLike<object> } },
  page: number,
) => {
  act(() => {
    pagerTurn(result, page - 1);
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

describe('MushafPager in spread mode', () => {
  /** The distinct pages that drew. A set, not the raw list: the mocked page
   *  records its props on every render pass, so the list double-counts. */
  const drawn = () => new Set(mocks.pageProps.map((p) => p['page']));

  /** A leaf whose two pages do NOT fit at the same size on the Tab S10+ half-box.
   *
   *  298 of 302 leaves have both pages clamped at the font cap there, so they
   *  agree whatever the code does and a shared-size assertion made on one of them
   *  passes vacuously. These four are where the mechanism is observable --
   *  see scripts/SPREAD-BAND-CHECK.md. */
  const DIVERGENT_RECTO = 27;

  it('spans the 302 leaves of the mushaf, not its 604 pages', () => {
    const pager = pagerPropsOf(render(<MushafPager {...props} spread />));
    expect(React.Children.count(pager.children)).toBe(SPREAD_COUNT);
  });

  it('draws two pages per leaf', () => {
    render(<MushafPager {...props} spread initialPage={3} />);
    // Ruling R-X6 keeps the window at one leaf so a swipe never lands on a cell
    // that draws nothing -- which costs six drawn pages against portrait's three.
    // The leaf the reader is on, plus one either side: six pages, not three.
    expect(drawn()).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(drawn().size).toBe(2 * (2 * WINDOW + 1));
  });

  it('puts the recto on the right in the layout, not just in the data', () => {
    // RTL: the recto is the RIGHT half. A row laying [recto, verso] out left to
    // right reads backwards and is invisible in any assertion made against the
    // page numbers alone, which is why this one is about flexDirection.
    const { container } = render(<MushafPager {...props} spread initialPage={3} />);
    const leaf = container.querySelector('[data-testid="mushaf-leaf"]') as HTMLElement;
    expect(leaf.style.flexDirection).toBe('row-reverse');
  });

  it('opens an even page on its own leaf, not as a recto', () => {
    // Rotating while on page 4 must land on leaf (3,4) with 4 on the LEFT, not
    // rebuild the book around 4 as a recto and shift all 604 pages by one.
    const pager = pagerPropsOf(render(<MushafPager {...props} spread initialPage={4} />));
    expect(pager.initialPage).toBe(1); // leaf (3,4)
    expect(drawn()).toContain(3);
    expect(drawn()).toContain(4);
  });

  it('gives each half exactly half the box', () => {
    // A page handed the full width overflows its half and the QCF page is
    // clipped rather than scaled, which looks like a font bug and not a layout
    // one.
    render(<MushafPager {...props} spread width={1400} initialPage={3} />);
    for (const page of mocks.pageProps) expect(page['width']).toBe(700);
  });

  it('sizes both halves of a leaf from the same number', () => {
    // Facing pages at different sizes read as a rendering bug. Each page's own
    // fit comes from its own widest line, so left alone they differ.
    render(<MushafPager {...props} spread width={1400} initialPage={DIVERGENT_RECTO} />);
    const leafSize = mushafLeafFontSize(DIVERGENT_RECTO, DIVERGENT_RECTO + 1, 700 - 32);
    const onLeaf = mocks.pageProps.filter(
      (p) => p['page'] === DIVERGENT_RECTO || p['page'] === DIVERGENT_RECTO + 1,
    );
    expect(onLeaf).not.toHaveLength(0);
    for (const page of onLeaf) expect(page['fontSize']).toBe(leafSize);
    // And the size is one the pages do not agree on by themselves, or the
    // assertion above would hold with the mechanism deleted.
    expect(mushafPageFontSize(DIVERGENT_RECTO, 700 - 32)).not.toBe(
      mushafPageFontSize(DIVERGENT_RECTO + 1, 700 - 32),
    );
  });

  it('sizes a leaf from the half it has, not the whole box', () => {
    // The leaf size has to be computed against the half a page actually draws
    // into. Against the full box it comes out too large, the page clamps it
    // back to its own fit, and the two halves are on different sizes again --
    // with the leaf size still looking present in every prop.
    render(<MushafPager {...props} spread width={1400} initialPage={DIVERGENT_RECTO} />);
    const onLeaf = mocks.pageProps.find((p) => p['page'] === DIVERGENT_RECTO)!;
    expect(onLeaf['fontSize']).toBe(
      mushafLeafFontSize(DIVERGENT_RECTO, DIVERGENT_RECTO + 1, 700 - 32),
    );
    expect(onLeaf['fontSize']).not.toBe(
      mushafLeafFontSize(DIVERGENT_RECTO, DIVERGENT_RECTO + 1, 1400 - 32),
    );
  });

  it('starts on the leaf holding the page it was given', () => {
    expect(pagerPropsOf(render(<MushafPager {...props} spread initialPage={107} />)).initialPage)
      .toBe(53); // leaf (107,108)
  });

  it('reports the recto when a leaf settles', () => {
    // The caller stores a single page number (R-B3, no data change), so a leaf
    // turn has to hand back a page and not a leaf index.
    const onPageChange = vi.fn();
    const result = render(
      <MushafPager {...props} spread initialPage={3} onPageChange={onPageChange} />,
    );
    act(() => {
      pagerTurn(result, 2);
    });
    expect(onPageChange).toHaveBeenCalledWith(5); // leaf 2 == pages 5,6
  });

  it('does not report a turn when it opens on a verso', () => {
    // Android fires onPageSelected once at mount. Opening on page 4 settles on
    // leaf (3,4), whose recto is 3 -- which must not be written back as a turn
    // the reader never made.
    const onPageChange = vi.fn();
    const result = render(
      <MushafPager {...props} spread initialPage={4} onPageChange={onPageChange} />,
    );
    act(() => {
      pagerPropsOf(result).onPageSelected?.({ nativeEvent: { position: 1 } });
    });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('remounts the pager when the mode flips', () => {
    // The child COUNT changes under it, 604 -> 302. ViewPager2 holds its
    // children by index, so a live pager handed a different-length list keeps
    // its old position and lands on the wrong leaf or on a blank one -- the
    // same hazard as changing a FlatList's numColumns.
    //
    // Asserted through the pager's own identity rather than its child count,
    // because the count changes with or without a remount: pagerHost keys the
    // turns it was asked for to the pager NODE, so a surviving instance carries
    // its pre-flip history and a remounted one starts empty.
    const result = render(<MushafPager {...props} initialPage={3} focusPage={108} />);
    expect(pagerCommandsOf(result)).toEqual([{ page: 107, animated: true }]);

    result.rerender(<MushafPager {...props} spread initialPage={3} focusPage={null} />);
    expect(pagerCommandsOf(result)).toEqual([]);
    expect(React.Children.count(pagerPropsOf(result).children)).toBe(SPREAD_COUNT);
  });

  it('does not turn a leaf that already shows the ayah being recited', () => {
    // Playback crossing from the recto onto the verso is a page change the
    // reader can SEE -- both halves are on screen -- so turning there flips the
    // leaf away from the ayah being recited on it. This is the one the plan
    // called the real bug: turn-on-every-page-change logic written for a
    // single-page pager.
    const result = render(<MushafPager {...props} spread initialPage={3} focusPage={null} />);
    result.rerender(<MushafPager {...props} spread initialPage={3} focusPage={4} />);
    expect(pagerCommandsOf(result)).toEqual([]);
  });

  it('turns the leaf when playback crosses onto the next one', () => {
    const result = render(<MushafPager {...props} spread initialPage={3} focusPage={null} />);
    result.rerender(<MushafPager {...props} spread initialPage={3} focusPage={5} />);
    expect(pagerCommandsOf(result)).toEqual([{ page: 2, animated: true }]);
  });

  it('reports the half it refused to turn to, so playback carries on', () => {
    // Refusing the turn is right; staying silent is not. The caller drives
    // playback off the page it believes is in view, so at a surah seam inside a
    // leaf -- page 106 finishes surah 4 and prints 5:1 below it -- a turn
    // request that is dropped leaves it waiting for an arrival that never comes,
    // and the recitation stops where portrait carries on.
    const onPageChange = vi.fn();
    const result = render(
      <MushafPager {...props} spread initialPage={3} focusPage={null} onPageChange={onPageChange} />,
    );
    result.rerender(
      <MushafPager {...props} spread initialPage={3} focusPage={4} onPageChange={onPageChange} />,
    );
    expect(pagerCommandsOf(result)).toEqual([]);
    expect(onPageChange).toHaveBeenCalledWith(4);

    // And the seam out of the leaf still turns, from the half just reported.
    result.rerender(
      <MushafPager {...props} spread initialPage={3} focusPage={5} onPageChange={onPageChange} />,
    );
    expect(pagerCommandsOf(result)).toEqual([{ page: 2, animated: true }]);
  });

it('follows the reader across a mode flip, not the page they opened on', () => {
    // The two defects a rotation exposes, and neither is visible in a render
    // that never flips. MushafPager itself does NOT remount on a flip -- only
    // the PagerView below it does -- so (a) `initialPage` would still be the
    // page the reader LAUNCHED on, dragging them back there on every rotation,
    // and (b) `current` would survive holding the old mode's unit, so the drawn
    // window would sit a hundred leaves from the leaf on screen and the reader
    // would rotate onto blank paper.
    const result = render(<MushafPager {...props} initialPage={106} />);
    settle(result, 300);
    // Only what the spread drew: the mocked page records every render, so the
    // portrait pages before the flip would otherwise count toward the set below.
    mocks.pageProps = [];

    result.rerender(<MushafPager {...props} spread initialPage={106} />);

    const leaf = 149; // spreadFor(300) -- pages 299, 300
    expect(pagerPropsOf(result).initialPage).toBe(leaf);
    // And the window moved with it: leaves 148..150, which is pages 297..302.
    expect(drawn()).toEqual(new Set([297, 298, 299, 300, 301, 302]));
  });

  it('follows the reader back when the flip goes the other way', () => {
    // Rotating back has to land on the leaf's own pages, not on leaf 149 read
    // as page 149.
    const result = render(<MushafPager {...props} spread initialPage={299} />);
    act(() => {
      pagerTurn(result, 149);
    });
    mocks.pageProps = [];

    result.rerender(<MushafPager {...props} initialPage={299} />);

    expect(pagerPropsOf(result).initialPage).toBe(298); // page 299, zero-based
    expect(drawn()).toContain(299);
    expect(drawn()).not.toContain(150);
  });

  it('holds both halves of a leaf until both fonts have settled', () => {
    // The two TTFs register independently, so a leaf that let each half draw on
    // its own font showed text on one side and blank paper on the other -- which
    // reads as a broken page, not as a page still loading. The reader's own
    // readiness signal cannot cover it: it watches initialPage, one of the two.
    mocks.fontPending.add(4);
    render(<MushafPager {...props} spread initialPage={3} />);

    expect(drawn()).not.toContain(3); // the half whose font HAS arrived
    expect(drawn()).not.toContain(4);
    // Per leaf, not across the window: the leaves either side still draw.
    expect(drawn()).toContain(1);
    expect(drawn()).toContain(6);
  });

  it('draws a leaf whose font failed rather than waiting for ever', () => {
    // A failure is as final as a success for the purpose of waiting. Held on
    // `ready` alone, a page whose font will never load would blank its facing
    // page for the life of the process.
    mocks.fontFailed.add(4);
    render(<MushafPager {...props} spread initialPage={3} />);
    expect(drawn()).toContain(3);
  });

  it('does not re-issue an auto-turn when only the handler identity changes', () => {
    // MushafScreen re-renders on every audio position tick and rebuilds its
    // handler with it. Depending on that identity re-ran the turn effect on
    // every tick while the turn was still in flight, and
    // setCurrentItem(sameIndex, smoothScroll) mid-scroll re-animates from
    // wherever the page has got to -- so the turn fought itself and crawled.
    const result = render(<MushafPager {...props} focusPage={null} />);
    result.rerender(<MushafPager {...props} focusPage={108} onPageChange={vi.fn()} />);
    expect(pagerCommandsOf(result)).toEqual([{ page: 107, animated: true }]);

    result.rerender(<MushafPager {...props} focusPage={108} onPageChange={vi.fn()} />);
    result.rerender(<MushafPager {...props} focusPage={108} onPageChange={vi.fn()} />);
    expect(pagerCommandsOf(result)).toEqual([{ page: 107, animated: true }]);
  });

  it('keeps an even page across a rotation instead of reporting its recto', () => {
    // A leaf is identified by its recto, and the reader may be on the verso.
    // Android fires onPageSelected once on mount and the flip remounts the
    // PagerView, so that mount-time event arrives naming the recto -- 299 for a
    // reader on page 300. Reported, it rewrites the saved reading position to
    // the facing page and rotating back lands on 299.
    const onPageChange = vi.fn();
    const result = render(
      <MushafPager {...props} initialPage={106} onPageChange={onPageChange} />,
    );
    settle(result, 300);
    onPageChange.mockClear();

    result.rerender(<MushafPager {...props} spread initialPage={106} onPageChange={onPageChange} />);
    // The remounted pager's own mount announcement, which is a BARE selection
    // and names the recto -- not a turn, and not the relayout artifact either.
    act(() => {
      pagerRelayout(result, 149);
    });
    expect(onPageChange).not.toHaveBeenCalled();

    // The page itself survives the round trip, which is what the reader sees.
    result.rerender(<MushafPager {...props} initialPage={106} onPageChange={onPageChange} />);
    expect(pagerPropsOf(result).initialPage).toBe(299); // page 300, zero-based
  });

  it('keeps every leaf in the tree, even when it draws nothing', () => {
    // ViewPager2 pages by child index here too: a leaf that is not handed over
    // shifts every leaf after it.
    const pager = pagerPropsOf(render(<MushafPager {...props} spread />));
    const cells = React.Children.toArray(pager.children) as { props: { children: unknown } }[];
    expect(cells).toHaveLength(SPREAD_COUNT);
    expect(cells[0]!.props.children).toBeNull();
  });

  it('memoises a leaf, so a chrome toggle does not redraw six pages', () => {
    // Twice the exposure portrait has: a leaf holds two pages, so an
    // unmemoised leaf costs six rasterisations where a page cost three.
    const pager = pagerPropsOf(render(<MushafPager {...props} spread initialPage={3} />));
    const cell = React.Children.toArray(pager.children)[1] as {
      props: { children: { type: { $$typeof?: symbol } } };
    };
    expect(cell.props.children.type.$$typeof).toBe(Symbol.for('react.memo'));
  });
});
