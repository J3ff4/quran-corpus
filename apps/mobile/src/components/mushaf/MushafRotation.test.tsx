import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

vi.mock('react-native-pager-view', async () => {
  const { pagerViewMock } = await import('@/testing/pagerHost.js');
  return pagerViewMock();
});

// Both real: this suite exists for what happens BETWEEN the reader and the
// pager when the measured box rotates, which is the one path each of their own
// suites has to stub out.
vi.mock('./MushafPage', async () => {
  const React = await import('react');
  return { MushafPage: () => React.createElement('div', { 'data-testid': 'page' }) };
});

vi.mock('@/mushaf/pageFont', () => ({
  useMushafPageFont: (page: number) => ({
    family: `QCF2${String(page).padStart(3, '0')}`,
    ready: true,
    error: null,
  }),
  mushafFontFamily: (page: number) => `QCF2${String(page).padStart(3, '0')}`,
}));

vi.mock('@/mushaf/mushafReaderData', () => ({
  useMushafAyahs: () => new Map(),
}));

vi.mock('@/motion/useReducedMotion', () => ({ useReducedMotion: () => false }));

import { pagerCommandsOf, pagerPropsOf, pagerRelayout, pagerTurn } from '@/testing/pagerHost';
import { setAutoLayout } from '@/testing/rnHosts';
import { spreadFor } from '@/mushaf/spread';

import { MushafReader } from './MushafReader';

const index = {
  pages: new Map(
    Array.from({ length: 604 }, (_, i) => i + 1).map((page) => [
      page,
      { page, startSurahId: 2, startAyahNumber: 1, surahName: 'S', juz: 1 },
    ]),
  ),
  surahNames: new Map([[2, 'Al-Baqara']]),
  ayahCounts: new Map([[2, 286]]),
  ready: true,
};

const props = {
  client: null,
  index,
  initialPage: 106,
  landingAyah: null,
  bookmarkedKeys: new Set<string>(),
  khatmPage: null,
  playingAyah: null,
  focusPage: null,
  uiLocale: 'en' as const,
  onPageChange: vi.fn(),
  onWordPress: vi.fn(),
  onTap: vi.fn(),
  onLanded: vi.fn(),
};

const PORTRAIT = { width: 876, height: 1400 };
const LANDSCAPE = { width: 1400, height: 820 };
// Still portrait, so the mode does not flip: a resize on its own.
const PORTRAIT_NARROW = { width: 700, height: 1400 };

afterEach(() => {
  cleanup();
  setAutoLayout(null);
});

it('holds its page when a resize reports a turn nobody made', () => {
  // Issue #107, at the point it enters. Measured on device 2026-10-01: resizing
  // the pager makes ViewPager2 re-derive its RTL scroll offset, land one index
  // short, and announce that as an arrival -- a BARE onPageSelected, with no
  // dragging or settling around it. Nothing turned, so the reported page must
  // not move, and the pager has to be put back where the reader was.
  setAutoLayout(PORTRAIT);
  const onPageChange = vi.fn();
  const result = render(<MushafReader {...props} onPageChange={onPageChange} />);
  act(() => {
    pagerTurn(result, 234); // a real swipe onto page 235
  });
  expect(onPageChange).toHaveBeenLastCalledWith(235);
  onPageChange.mockClear();

  // A resize that does NOT flip the mode -- multi-window, or the window
  // settling -- which is the measurement that isolated the artifact from the
  // rotation it was first seen through.
  setAutoLayout(PORTRAIT_NARROW);
  act(() => {
    result.rerender(<MushafReader {...props} onPageChange={onPageChange} />);
  });
  act(() => {
    pagerRelayout(result, 233);
  });

  expect(onPageChange).not.toHaveBeenCalled();
  expect(pagerCommandsOf(result).at(-1)).toEqual({ page: 234, animated: false });
});

it('rotates onto the leaf holding the page, not the one before it', () => {
  // The defect as the owner met it: in portrait on page 235, rotating landed on
  // the leaf holding 234. The flip's own algebra was always right -- it asked
  // for the leaf holding whatever `settled` said, and the resize above had
  // already decremented `settled` behind it.
  setAutoLayout(PORTRAIT);
  const result = render(<MushafReader {...props} />);
  act(() => {
    pagerTurn(result, 234); // a real swipe onto page 235
  });

  // The rotation's own relayout, arriving one index short before the mode flip
  // commits. This is the event the reader never caused.
  act(() => {
    pagerRelayout(result, 233);
  });

  setAutoLayout(LANDSCAPE);
  act(() => {
    result.rerender(<MushafReader {...props} />);
  });

  expect(pagerPropsOf(result).initialPage).toBe(spreadFor(235).index);
});

it('still follows a turn the reader actually made', () => {
  // The guard rejects an arrival with no gesture behind it, so the gesture path
  // has to keep working: a swipe is reported, and a second swipe after a resize
  // is reported too -- the artifact must not leave the pager deaf.
  setAutoLayout(PORTRAIT);
  const onPageChange = vi.fn();
  const result = render(<MushafReader {...props} onPageChange={onPageChange} />);
  act(() => {
    pagerTurn(result, 234);
  });
  act(() => {
    pagerRelayout(result, 233);
  });
  act(() => {
    pagerTurn(result, 235); // page 236
  });
  expect(onPageChange).toHaveBeenLastCalledWith(236);
});

it('does not let an abandoned drag vouch for a later resize', () => {
  // A drag the reader pulls partway and releases settles back onto the same
  // page, so ViewPager2 reports no arrival: `dragging, settling, idle` and
  // nothing else. The gesture flag has to come down with that idle, or it sits
  // raised waiting to certify the next relayout's bogus position as a turn.
  setAutoLayout(PORTRAIT);
  const onPageChange = vi.fn();
  const result = render(<MushafReader {...props} onPageChange={onPageChange} />);
  act(() => {
    pagerTurn(result, 234);
  });
  onPageChange.mockClear();

  const props_ = pagerPropsOf(result);
  act(() => {
    props_.onPageScrollStateChanged?.({ nativeEvent: { pageScrollState: 'dragging' } });
    props_.onPageScrollStateChanged?.({ nativeEvent: { pageScrollState: 'settling' } });
    props_.onPageScrollStateChanged?.({ nativeEvent: { pageScrollState: 'idle' } });
  });
  act(() => {
    pagerRelayout(result, 233);
  });

  expect(onPageChange).not.toHaveBeenCalled();
});
