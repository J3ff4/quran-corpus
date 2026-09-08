import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

// The page draws through expo-font, which dies at import under jsdom.
vi.mock('@/mushaf/pageFont', () => ({
  useMushafPageFont: () => ({ family: 'QCF2106', ready: false, error: null }),
  mushafFontFamily: (page: number) => `QCF2${String(page).padStart(3, '0')}`,
}));

import { listPropsOf } from '@/testing/rnHosts';

import { MushafPager } from './MushafPager';

afterEach(cleanup);

const props = {
  client: null,
  initialPage: 106,
  width: 360,
  height: 720,
  highlights: { bookmarked: new Set<string>(), landing: null, playing: null, landingProgress: 0 },
  ayahTexts: new Map<string, string>(),
  surahNames: new Map<number, string>(),
  juzByPage: new Map<number, number>(),
  uiLocale: 'en' as const,
  onPageChange: vi.fn(),
  onWordPress: vi.fn(),
};

/** The settle event RN emits at the end of a paging scroll. */
const settleAt = (page: number) => ({
  nativeEvent: { contentOffset: { x: (page - 1) * props.width, y: 0 } },
});

describe('MushafPager', () => {
  it('spans exactly the 604 pages of the mushaf', () => {
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.data).toHaveLength(604);
    expect(list.data?.[0]).toBe(1);
    expect(list.data?.[603]).toBe(604);
  });

  it('starts on the page it was given', () => {
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.initialScrollIndex).toBe(105); // page 106
  });

  it('opens on a real page when handed one outside the mushaf', () => {
    // initialScrollIndex is not bounds-checked by FlatList: an index past the
    // data crashes the scroll rather than showing an empty page, and this
    // number arrives from a route param and the user DB.
    const list = listPropsOf(render(<MushafPager {...props} initialPage={0} />));
    expect(list.initialScrollIndex).toBe(0);
    const past = listPropsOf(render(<MushafPager {...props} initialPage={999} />));
    expect(past.initialScrollIndex).toBe(603);
  });

  it('is inverted, so a right-to-left swipe advances like the book', () => {
    // Ruling 7. Inverted and NOT I18nManager.forceRTL, which flips every
    // screen in the app -- the UI locale is a separate user setting from the
    // mushaf's reading direction.
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.inverted).toBe(true);
    expect(list.pagingEnabled).toBe(true);
    expect(list.horizontal).toBe(true);
  });

  it('gives every page the same width, so getItemLayout is exact', () => {
    // 604 fixed-width items mean initialScrollIndex lands without a scan.
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.getItemLayout?.(null, 105)).toEqual({
      length: 360,
      offset: 360 * 105,
      index: 105,
    });
  });

  it('reports the settled page', () => {
    const onPageChange = vi.fn();
    const list = listPropsOf(render(<MushafPager {...props} onPageChange={onPageChange} />));
    list.onMomentumScrollEnd?.(settleAt(107));
    expect(onPageChange).toHaveBeenCalledWith(107);
  });

  it('reports a page turn exactly once per settle', () => {
    // This is the write point for the durable reading position (ruling 15).
    // Firing on every scroll frame would write the user DB dozens of times
    // per swipe -- the whole reason issue #59's old scroll handler was wrong.
    const onPageChange = vi.fn();
    const list = listPropsOf(render(<MushafPager {...props} onPageChange={onPageChange} />));
    list.onMomentumScrollEnd?.(settleAt(107));
    list.onMomentumScrollEnd?.(settleAt(107));
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  it('says nothing when a drag snaps back to the page it started on', () => {
    const onPageChange = vi.fn();
    const list = listPropsOf(render(<MushafPager {...props} onPageChange={onPageChange} />));
    list.onMomentumScrollEnd?.(settleAt(106));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('keeps only a narrow window of pages mounted', () => {
    // Every mounted page registers a ~200KB font that expo-font never
    // unloads. Windowing is what bounds the cost of paging through a juz.
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.windowSize).toBe(3);
    expect(list.maxToRenderPerBatch).toBe(1);
    expect(list.removeClippedSubviews).toBe(true);
  });

  it('draws a page per item, keyed by its page number', () => {
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.keyExtractor?.(106, 105)).toBe('106');
  });
});
