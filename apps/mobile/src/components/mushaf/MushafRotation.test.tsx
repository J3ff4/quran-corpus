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

import { pagerPropsOf } from '@/testing/pagerHost';
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

afterEach(() => {
  cleanup();
  setAutoLayout(null);
});

it('rotates onto the leaf holding the page, not the one before it', () => {
  setAutoLayout(PORTRAIT);
  const result = render(<MushafReader {...props} />);
  // The reader swiped to page 235: portrait index 234.
  act(() => {
    pagerPropsOf(result).onPageSelected?.({ nativeEvent: { position: 234 } });
  });

  setAutoLayout(LANDSCAPE);
  act(() => {
    result.rerender(<MushafReader {...props} />);
  });

  expect(pagerPropsOf(result).initialPage).toBe(spreadFor(235).index);
});
