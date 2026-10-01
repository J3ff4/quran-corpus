import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

const mocks = vi.hoisted(() => ({
  pagerProps: [] as Array<Record<string, unknown>>,
  fontReady: true,
  fontError: null as Error | null,
  ayahs: new Map<string, unknown>(),
  ayahSurahIds: [] as readonly number[],
  reduceMotion: false,
}));

// Mocked: the pager has its own suite, and what this component does is decide
// what the pager is handed.
vi.mock('./MushafPager', async () => {
  const React = await import('react');
  const { useHighlights } = await import('@/mushaf/highlightsContext.js');
  return {
    // `highlights` is recorded off the CONTEXT, not off the props: the marks
    // reach the drawn pages that way so the real pager can stay memoised
    // (see HighlightsProvider). Reading it from inside the pager's own
    // position in the tree is what keeps these assertions honest -- drop the
    // provider and every one of them sees the context's empty default.
    MushafPager: (props: Record<string, unknown>) => {
      mocks.pagerProps.push({ ...props, highlights: useHighlights() });
      return React.createElement('div', { 'data-testid': 'pager' });
    },
  };
});

vi.mock('@/mushaf/pageFont', () => ({
  useMushafPageFont: () => ({ family: 'QCF2106', ready: mocks.fontReady, error: mocks.fontError }),
}));

vi.mock('@/mushaf/mushafReaderData', () => ({
  useMushafAyahs: (_client: unknown, surahIds: readonly number[]) => {
    mocks.ayahSurahIds = surahIds;
    return mocks.ayahs;
  },
}));

vi.mock('@/motion/useReducedMotion', () => ({ useReducedMotion: () => mocks.reduceMotion }));

import { ayahKey } from '@/mushaf/highlights';
import { setAutoLayout } from '@/testing/rnHosts';

import { MushafReader } from './MushafReader';

const index = {
  pages: new Map([
    [105, { page: 105, startSurahId: 5, startAyahNumber: 70, surahName: 'Al-Maidah', juz: 6 }],
    [106, { page: 106, startSurahId: 5, startAyahNumber: 82, surahName: 'Al-Maidah', juz: 6 }],
    // A page whose opening ayah carries no juz: the footer takes 0, not NaN.
    [107, { page: 107, startSurahId: 5, startAyahNumber: 90, surahName: 'Al-Maidah', juz: null }],
  ]),
  surahNames: new Map([[5, 'Al-Maidah']]),
  ayahCounts: new Map([[5, 120]]),
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

beforeEach(() => {
  mocks.pagerProps = [];
  mocks.fontReady = true;
  mocks.fontError = null;
  mocks.reduceMotion = false;
  mocks.ayahs = new Map();
  mocks.ayahSurahIds = [];
  // jsdom lays nothing out, and this component draws nothing until it has a
  // measured box -- the page is sized to the space under the reader's header,
  // not to the window.
  setAutoLayout({ width: 360, height: 720 });
});

afterEach(() => {
  setAutoLayout(null);
  cleanup();
});

describe('MushafReader', () => {
it('keeps one page per child when the box is taller than it is wide', () => {
    // Portrait is not changing in this phase (ruling R-B2). A regression here is
    // the phase failing, not a detail.
    setAutoLayout({ width: 876, height: 1400 });
    render(<MushafReader {...props} />);
    expect(mocks.pagerProps.at(-1)).toMatchObject({ spread: false });
  });

it('fetches a page further either side on a spread', () => {
    // `page` is the leaf's RECTO and the pager draws a leaf either side, so the
    // drawn pages run recto - 2 .. recto + 3. At portrait's width the first and
    // last drawn pages fall outside the fetched range, and a page outside it
    // still draws its words -- it just draws its surah band and its bismillah
    // line empty, which is how this failed on page 604 before.
    // Out to 112, so the page one past the window has a surah of its own and the
    // forward edge is observable rather than falling through to LAST_SURAH_ID.
    const pages = new Map(
      [103, 104, 105, 106, 107, 108, 109, 110, 111, 112].map((page) => [
        page,
        {
          page,
          startSurahId: page - 100,
          startAyahNumber: 1,
          surahName: `S${page}`,
          juz: 6,
        },
      ]),
    );
    setAutoLayout({ width: 1400, height: 820 });
    render(<MushafReader {...props} initialPage={107} index={{ ...index, pages }} />);

    // Leaf (107,108) is leaf 53, so leaves 52..54 draw pages 105..110. The range
    // runs from page 105's own surah to the surah page 111 opens with -- a surah
    // that starts partway down page 110 is page 111's opener, and page 110 has
    // to draw its bismillah.
    expect(mocks.ayahSurahIds).toContain(5); // page 105, the first drawn page
    expect(mocks.ayahSurahIds).toContain(11); // page 111, one past the window
    expect(mocks.ayahSurahIds).not.toContain(4); // page 104 is not drawn
  });

  it('keeps portrait on the window it has always used', () => {
    // The widening is landscape-only. Fetching two pages either side in portrait
    // would pull surahs nothing on screen can draw, which is three extra
    // queries per turn for nothing.
    const pages = new Map(
      [103, 104, 105, 106, 107, 108, 109].map((page) => [
        page,
        { page, startSurahId: page - 100, startAyahNumber: 1, surahName: `S${page}`, juz: 6 },
      ]),
    );
    setAutoLayout({ width: 876, height: 1400 });
    render(<MushafReader {...props} initialPage={106} index={{ ...index, pages }} />);

    expect(mocks.ayahSurahIds).toContain(5); // page 105, the first drawn page
    expect(mocks.ayahSurahIds).not.toContain(4); // page 104 is not drawn
  });

  it('asks for a spread when the box is wider than it is tall', () => {
    setAutoLayout({ width: 1400, height: 820 });
    render(<MushafReader {...props} />);
    expect(mocks.pagerProps.at(-1)).toMatchObject({ spread: true });
  });

  it('decides on the measured box, not on the window it sits in', () => {
    // A 1000dp-wide tablet in portrait is still portrait, and a spread there
    // would be two tall narrow pages. The box is also NOT the window: the pager
    // sits under the status bar, MushafTopStrip and the tab bar, so near square
    // the window and the box disagree and only the box is what a page has to
    // fit (ruling R-X1).
    setAutoLayout({ width: 1000, height: 1400 });
    render(<MushafReader {...props} />);
    expect(mocks.pagerProps.at(-1)).toMatchObject({ spread: false });
  });

  it('draws nothing until it knows how big a page is', () => {
    // A page sized to the window rather than to the space under the header
    // pushes its own footer off the bottom of the screen.
    setAutoLayout(null);
    render(<MushafReader {...props} />);

    expect(mocks.pagerProps).toHaveLength(0);
  });

  it('hands the pager the measured page box', () => {
    render(<MushafReader {...props} />);

    expect(mocks.pagerProps.at(-1)).toMatchObject({ width: 360, height: 720, initialPage: 106 });
  });

  it('asks for every surah the pages on screen can hold, not just the ones they open with', () => {
    // Page 604 opens with al-Ikhlas and then heads al-Falaq and an-Nas. Asking
    // only for each page's opening surah left both of their bismillah lines
    // blank on the device -- the text for a surah nobody opened a page with
    // was never fetched.
    const lastPages = new Map([
      [603, { page: 603, startSurahId: 106, startAyahNumber: 1, surahName: 'Quraysh', juz: 30 }],
      [604, { page: 604, startSurahId: 112, startAyahNumber: 1, surahName: 'Al-Ikhlas', juz: 30 }],
    ]);
    render(
      <MushafReader
        {...props}
        initialPage={604}
        index={{ ...index, pages: lastPages, surahNames: new Map([[114, 'An-Nas']]) }}
      />,
    );

    expect(mocks.ayahSurahIds).toContain(113);
    expect(mocks.ayahSurahIds).toContain(114);
  });

  it('turns a long-pressed glyph into the ayah row the word sheet needs', () => {
    // The layout rows carry a coordinate, not a word id. Without the lookup
    // the sheet has nothing to open on.
    mocks.ayahs = new Map([[ayahKey(5, 82), { id: 682, text_uthmani: 'الآية' }]]);
    const onWordPress = vi.fn();
    render(<MushafReader {...props} onWordPress={onWordPress} />);

    const tap = mocks.pagerProps.at(-1)?.['onWordLongPress'] as (word: unknown) => void;
    act(() => tap({ surahId: 5, ayahNumber: 82, position: 3, charType: 'word', glyph: '' }));

    // The word AND its ayah row: the row id answers "which words", the word
    // answers "which surah", and on a page holding two surahs the second is
    // not derivable from the screen.
    expect(onWordPress).toHaveBeenCalledWith(
      expect.objectContaining({ surahId: 5, ayahNumber: 82, position: 3 }),
      682,
    );
  });

  it('opens nothing for a word whose ayah rows have not arrived', () => {
    const onWordPress = vi.fn();
    render(<MushafReader {...props} onWordPress={onWordPress} />);

    const tap = mocks.pagerProps.at(-1)?.['onWordLongPress'] as (word: unknown) => void;
    act(() => tap({ surahId: 5, ayahNumber: 82, position: 3, charType: 'word', glyph: '' }));

    expect(onWordPress).not.toHaveBeenCalled();
  });

  it('publishes the real Uthmani text of the surahs on screen', () => {
    // Ruling 12: TalkBack reads this, never the glyph codepoints.
    mocks.ayahs = new Map([[ayahKey(5, 82), { id: 682, text_uthmani: 'الآية' }]]);
    render(<MushafReader {...props} />);

    const texts = mocks.pagerProps.at(-1)?.['ayahTexts'] as Map<string, string>;
    expect(texts.get('5:82')).toBe('الآية');
  });

  it('reports a page turn and follows it with the next window of surahs', () => {
    const onPageChange = vi.fn();
    render(<MushafReader {...props} onPageChange={onPageChange} />);

    const turn = mocks.pagerProps.at(-1)?.['onPageChange'] as (page: number) => void;
    act(() => turn(107));

    expect(onPageChange).toHaveBeenCalledWith(107);
  });

  it('waits for the first page-s font before it lets the reader cross-fade', () => {
    // A page whose font has not registered draws its paper ground and nothing
    // else. Fading onto that is the blank the reader-s layering exists to
    // remove.
    mocks.fontReady = false;
    const onLanded = vi.fn();
    render(<MushafReader {...props} onLanded={onLanded} />);

    expect(onLanded).not.toHaveBeenCalled();
  });

  it('lands anyway when the font fails, rather than holding the old rendering for ever', () => {
    mocks.fontReady = false;
    mocks.fontError = new Error('no bundled font');
    const onLanded = vi.fn();
    render(<MushafReader {...props} onLanded={onLanded} />);

    expect(onLanded).toHaveBeenCalled();
  });

  it('pulses the ayah a deep link asked for, and lets the pulse fade', () => {
    vi.useFakeTimers();
    try {
      render(
        <MushafReader {...props} landingAyah={{ surahId: 5, ayahNumber: 82 }} />,
      );
      const highlightsAt = (call: number) =>
        mocks.pagerProps.at(call)?.['highlights'] as { landing: string | null; landingProgress: number };

      expect(highlightsAt(-1)).toMatchObject({ landing: '5:82', landingProgress: 1 });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Gone, not merely dimmer: a landing mark that never clears is a
      // permanent highlight on an ayah the reader stopped looking at.
      expect(highlightsAt(-1)).toMatchObject({ landing: null, landingProgress: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the ayah being recited, which outranks the rest', () => {
    render(
      <MushafReader {...props} playingAyah={{ surahId: 5, ayahNumber: 90 }} focusPage={107} />,
    );

    expect(mocks.pagerProps.at(-1)?.['highlights']).toMatchObject({ playing: '5:90' });
    expect(mocks.pagerProps.at(-1)?.['focusPage']).toBe(107);
  });

  it('leaves the press wash to the page, so a touch cannot re-render its siblings', () => {
    // A swipe begins with a finger on a word. While this state lived here, that
    // first touch re-rendered the reader and all three mounted pages before the
    // page had moved at all. Nothing above the pager knows about it now.
    render(<MushafReader {...props} />);

    expect(mocks.pagerProps.at(-1)?.['onWordPressIn']).toBeUndefined();
    expect((mocks.pagerProps.at(-1)?.['highlights'] as { pressed: unknown }).pressed).toBeNull();
  });
});
