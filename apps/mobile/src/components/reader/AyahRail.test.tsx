import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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
