import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { listPropsOf, listScrollsOf } from '@/testing/rnHosts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const win = vi.hoisted(() => ({ width: 1400, height: 900 }));

vi.mock('react-native', async () => ({
  ...(await import('@/testing/rnHosts.js')).reactNativeTextMock(),
  useWindowDimensions: () => ({ ...win, scale: 3, fontScale: 1 }),
}));

import { AyahRail, juzMarksForSurah } from './AyahRail';

const index = [
  {
    juz: 1,
    startSurahId: 1,
    startAyahNumber: 1,
    surahName: 'Al-Fatiha',
    ayahCount: 148,
    ranges: [
      { surahId: 1, surahName: 'Al-Fatiha', firstAyahNumber: 1, lastAyahNumber: 7, ayahCount: 7 },
      { surahId: 2, surahName: 'Al-Baqara', firstAyahNumber: 1, lastAyahNumber: 141, ayahCount: 141 },
    ],
  },
  {
    juz: 2,
    startSurahId: 2,
    startAyahNumber: 142,
    surahName: 'Al-Baqara',
    ayahCount: 111,
    ranges: [
      { surahId: 2, surahName: 'Al-Baqara', firstAyahNumber: 142, lastAyahNumber: 252, ayahCount: 111 },
    ],
  },
];

describe('juzMarksForSurah', () => {
  it('returns every juz that touches the surah, at the ayah it starts on there', () => {
    // Al-Baqara spans juz 1 (from 1) and juz 2 (from 142). The mark is the
    // range's firstAyahNumber, NOT the juz's own startAyahNumber -- juz 2
    // starts at 2:142 so they agree there, but juz 1 starts at 1:1, which is
    // not in Al-Baqara at all and would put a "JUZ 1" mark on a wrong row.
    expect(juzMarksForSurah(index, 2)).toEqual([
      { juz: 1, firstAyahNumber: 1 },
      { juz: 2, firstAyahNumber: 142 },
    ]);
  });

  it('marks a juz that opened in the PREVIOUS surah at ayah 1, not at its own start', () => {
    // The whole reason this reads `ranges` and not `entry.startAyahNumber`.
    // The fixture above cannot show it: juz 1 starts at 1:1 and its Al-Baqara
    // range starts at 2:1, so both are the integer 1, and juz 2 opens inside
    // Al-Baqara itself, so both are 142. Swapping the two fields is silent
    // against it -- the brief's own mutation-check was toothless (caught by
    // the Task 8 implementer). Juz 3 opens at 2:253 and runs into Aal-Imran,
    // where its first ayah is 1: here the two fields genuinely disagree, and
    // reading the wrong one puts a "JUZ 3" heading on an ayah 252 rows down a
    // 200-ayah surah -- or on no row at all in a short one.
    const spanning = [
      {
        juz: 3,
        startSurahId: 2,
        startAyahNumber: 253,
        surahName: 'Al-Baqara',
        ayahCount: 126,
        ranges: [
          { surahId: 2, surahName: 'Al-Baqara', firstAyahNumber: 253, lastAyahNumber: 286, ayahCount: 34 },
          { surahId: 3, surahName: 'Aal-Imran', firstAyahNumber: 1, lastAyahNumber: 92, ayahCount: 92 },
        ],
      },
    ];

    expect(juzMarksForSurah(spanning, 3)).toEqual([{ juz: 3, firstAyahNumber: 1 }]);
  });

  it('returns one mark for a surah inside a single juz', () => {
    expect(juzMarksForSurah(index, 1)).toEqual([{ juz: 1, firstAyahNumber: 1 }]);
  });

  it('returns nothing for a surah the index does not reach', () => {
    expect(juzMarksForSurah(index, 114)).toEqual([]);
  });

  it('orders marks by juz, whatever order the index arrives in', () => {
    expect(juzMarksForSurah([...index].reverse(), 2).map((m) => m.juz)).toEqual([1, 2]);
  });
});

describe('AyahRail', () => {
  afterEach(cleanup);

  const props = {
    surahId: 2,
    ayahCount: 5,
    juzMarks: [{ juz: 1, firstAyahNumber: 1 }],
    activeAyahNumber: 2,
    collapsed: false,
    onToggleCollapsed: () => {},
    onSelectAyah: () => {},
  };

  it('marks the active ayah, and only that one', () => {
    render(<AyahRail {...props} />);
    const active = screen.getAllByTestId('rail-ayah').filter((n) => n.dataset.active === 'true');
    expect(active).toHaveLength(1);
    expect(active[0]!.dataset.ayah).toBe('2');
  });

  it('draws a juz heading at the ayah the juz starts on', () => {
    render(<AyahRail {...props} juzMarks={[{ juz: 1, firstAyahNumber: 1 }, { juz: 2, firstAyahNumber: 4 }]} />);
    expect(screen.getAllByTestId('rail-juz').map((n) => n.dataset.beforeAyah)).toEqual(['1', '4']);
  });

  it('gives every row a 48dp target', () => {
    // §8: a strip of small numerals is not a thumb target.
    render(<AyahRail {...props} />);
    for (const row of screen.getAllByTestId('rail-ayah')) {
      expect(Number.parseFloat(row.style.minHeight)).toBeGreaterThanOrEqual(48);
    }
  });

  it('survives a jump to an ayah that has never been measured', () => {
    // A FlatList whose scrollToIndex lands on an offscreen index throws an
    // Invariant Violation -- "scrollToIndex should be used in conjunction with
    // getItemLayout or onScrollToIndexFailed" -- and on the device that is not
    // a warning, it takes the whole app down. Deep-linking into the middle of
    // a surah does exactly that: opening Al-Baqara at 2:147 crashed vc73 on
    // mount. getItemLayout is the wrong half of the pair here, because a juz
    // heading makes the rows non-uniform.
    const result = render(<AyahRail {...props} ayahCount={286} activeAyahNumber={147} />);

    const onFailed = listPropsOf(result)['onScrollToIndexFailed'] as
      | ((info: { index: number; averageItemLength: number }) => void)
      | undefined;
    expect(typeof onFailed).toBe('function');

    // And it must actually move the list, not just exist to silence the
    // invariant: a no-op handler leaves the rail parked at ayah 1 while the
    // reader is 146 ayahs further down.
    onFailed!({ index: 146, averageItemLength: 48 });
    expect(listScrollsOf(result).at(-1)).toMatchObject({ offset: 146 * 48 });
  });

  it('asks again once the jumped-to cells have measured', () => {
    // The estimate alone is not enough: the average comes from the few cells
    // measured so far, so on a long surah it undershoots -- on the device it
    // parked the rail at ayah 67 while the reader was at 154. The offset jump
    // mounts the cells around the target; the retry is what actually lands.
    vi.useFakeTimers();
    try {
      const result = render(<AyahRail {...props} ayahCount={286} activeAyahNumber={147} />);
      const onFailed = listPropsOf(result)['onScrollToIndexFailed'] as (info: {
        index: number;
        averageItemLength: number;
      }) => void;

      onFailed({ index: 146, averageItemLength: 48 });
      vi.advanceTimersByTime(200);

      expect(listScrollsOf(result).at(-1)).toMatchObject({ index: 146 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up rather than yanking the offset forever', () => {
    // A retry that fails re-enters this same handler, so without a cap an
    // unreachable target jumps the offset every 100ms for as long as the rail
    // is mounted -- fighting any manual scroll, on the exact long surah the
    // two-step landing exists for.
    vi.useFakeTimers();
    try {
      const result = render(<AyahRail {...props} ayahCount={286} activeAyahNumber={147} />);
      const onFailed = listPropsOf(result)['onScrollToIndexFailed'] as (info: {
        index: number;
        averageItemLength: number;
      }) => void;

      // The follow effect has already asked once on mount; only what the
      // handler adds is under test.
      const before = listScrollsOf(result).filter((call) => 'index' in call).length;
      for (let round = 0; round < 6; round += 1) {
        onFailed({ index: 146, averageItemLength: 48 });
        vi.advanceTimersByTime(200);
      }

      // Two retries. Every later round may still jump to the estimated
      // offset, but it must schedule nothing more.
      const retried = listScrollsOf(result).filter((call) => 'index' in call);
      expect(retried).toHaveLength(before + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives a fresh target a fresh retry budget', () => {
    // The cap stops one unreachable index looping; it must not stop the rail
    // following the reader down the surah.
    vi.useFakeTimers();
    try {
      const result = render(<AyahRail {...props} ayahCount={286} activeAyahNumber={147} />);
      const onFailed = listPropsOf(result)['onScrollToIndexFailed'] as (info: {
        index: number;
        averageItemLength: number;
      }) => void;

      for (let round = 0; round < 4; round += 1) {
        onFailed({ index: 146, averageItemLength: 48 });
        vi.advanceTimersByTime(200);
      }
      result.rerender(<AyahRail {...props} ayahCount={286} activeAyahNumber={200} />);
      onFailed({ index: 199, averageItemLength: 48 });
      vi.advanceTimersByTime(200);

      expect(listScrollsOf(result).at(-1)).toMatchObject({ index: 199 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces its rows as buttons that name their ayah', () => {
    // A bare numeral announces as "147" with no role and no context, while
    // the toggle above got the full disclosure treatment (§8, WCAG AA).
    render(<AyahRail {...props} />);

    const row = screen.getAllByTestId('rail-ayah')[1]!;
    expect(row.getAttribute('role')).toBe('button');
    expect(row.getAttribute('aria-label')).toBe('Ayah 2');
  });

  it('hides itself from the accessibility tree when the reader asks', () => {
    // accessibilityViewIsModal is iOS-only, so on Android this prop is the
    // only thing keeping a TalkBack swipe from walking off an open sheet onto
    // every ayah button in the rail.
    render(<AyahRail {...props} importantForAccessibility="no-hide-descendants" />);

    expect(screen.getByTestId('ayah-rail').getAttribute('data-hidden-from-a11y')).toBe('true');
  });

  it('bounds its list so the rail can actually scroll', () => {
    // A FlatList with no flex of its own sizes to its content, and 286 rows
    // of content in a container with overflow:hidden is a clipped, unscrollable
    // column: on the device every swipe landed on a row as a press instead of
    // scrolling (vc75). flex: 1 is what gives it the container's height.
    const result = render(<AyahRail {...props} ayahCount={286} />);

    expect(listPropsOf(result)['style']).toMatchObject({ flex: 1 });
  });

  it('draws only the toggle when collapsed', () => {
    render(<AyahRail {...props} collapsed />);
    expect(screen.queryAllByTestId('rail-ayah')).toHaveLength(0);
    expect(screen.getByTestId('rail-toggle')).toBeTruthy();
  });

  it('pairs aria-expanded with aria-controls on the toggle', () => {
    // Review-flagged pattern in this repo: a disclosure with
    // accessibilityState.expanded and nothing saying what it controls.
    render(<AyahRail {...props} />);
    const toggle = screen.getByTestId('rail-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('reader-ayah-rail');
  });
});
