import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

// The real hook pulls expo-font -> expo-modules-core, which dies at import
// under jsdom, and readiness is the one thing these tests drive directly.
const { fontReady } = vi.hoisted(() => ({ fontReady: { current: true } }));
vi.mock('@/mushaf/pageFont', () => ({
  useMushafPageFont: () => ({ family: 'QCF2106', ready: fontReady.current, error: null }),
  mushafFontFamily: (page: number) => `QCF2${String(page).padStart(3, '0')}`,
}));

import { ayahKey } from '@/mushaf/highlights';

import { MushafPage } from './MushafPage';

// Four tokens, as the corpus spells it. splitBasmala counts tokens, so a
// stand-in string would leave the prefix unrecognised and assert nothing.
const BASMALA = '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064e\u0647\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650';

const word = (surahId: number, ayahNumber: number, position: number, glyph: string) => ({
  surahId,
  ayahNumber,
  position,
  charType: 'word' as const,
  glyph,
});

// Two lines of words, no chrome: the shape of an ordinary page's middle.
const plainLines = [
  { line: 1, words: [word(2, 1, 1, 'A'), word(2, 1, 2, 'B')] },
  { line: 2, words: [word(2, 2, 1, 'C')] },
];

// A surah opening: lines 1-2 empty, so composePage puts a band on 1 and the
// bismillah on 2, and the surah's own words start on line 3.
const openingLines = [
  { line: 3, words: [word(5, 1, 1, 'D')] },
  { line: 4, words: [word(5, 1, 2, 'E')] },
];

const props = {
  page: 106,
  lines: plainLines,
  width: 360,
  height: 640,
  highlights: { bookmarked: new Set<string>(), landing: null, playing: null, landingProgress: 0 },
  ayahTexts: new Map([
    [ayahKey(2, 1), 'ALIF LAM MIM'],
    // The real row shape: an ayah 1 carries the basmala AND the ayah after it.
    [ayahKey(5, 1), `${BASMALA} \u064a\u0640\u0670\u0623\u064e\u064a\u0651\u064f\u0647\u064e\u0627 \u0627\u0644\u0651\u064e\u0630\u0650\u064a\u0646\u064e`],
  ]),
  surahNames: new Map([[5, 'Al-Ma-idah']]),
  juz: 6,
  uiLocale: 'en' as const,
  onWordPress: () => {},
};

const lineBoxesOf = (container: HTMLElement) =>
  container.querySelectorAll('[data-testid="mushaf-line-slot"]');

beforeEach(() => {
  fontReady.current = true;
});
afterEach(cleanup);

describe('MushafPage', () => {
  it('draws nothing but the page ground until the font is registered', () => {
    // A page drawn early renders QCF codepoints in the system face, which
    // looks like Arabic and is not the Qur'an. Blank is the safe state.
    fontReady.current = false;
    const { container } = render(<MushafPage {...props} />);
    expect(container.textContent).toBe('');
  });

  it('draws the lines once the font is ready', () => {
    const { container } = render(<MushafPage {...props} />);
    expect(container.textContent).toContain('A');
  });

  it('draws them in the page-s own font, not the system face', () => {
    const { container } = render(<MushafPage {...props} />);
    expect(container.innerHTML).toContain('QCF2106');
  });

  it('publishes one accessible label per ayah, with real Uthmani text', () => {
    render(<MushafPage {...props} />);
    expect(screen.getByLabelText(/ALIF LAM MIM/)).toBeTruthy();
  });

  it('hides the glyph lines from a screen reader', () => {
    // They are private-use codepoints; read aloud they are gibberish, so the
    // per-ayah labels above are the only thing TalkBack should reach.
    const { container } = render(<MushafPage {...props} />);
    const rows = container.querySelectorAll('[data-hidden-from-a11y="true"]');
    expect(rows).toHaveLength(plainLines.length);
  });

  it('lets the a11y overlay pass its touches through to the words', () => {
    // It covers the whole text block. Without this every word on every page is
    // untappable, and nothing about the page looks wrong.
    const { container } = render(<MushafPage {...props} />);
    const overlay = container.querySelector('[data-pointer-events="none"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.querySelectorAll('[aria-label]')).toHaveLength(2);
  });

  it('draws a surah band where the composition puts one', () => {
    const { container } = render(<MushafPage {...props} lines={openingLines} />);
    expect(container.textContent).toContain('Al-Ma-idah');
  });

  it('draws the bismillah from the surah-s own ayah 1, not a constant', () => {
    // 95:1 and 97:1 spell it with a shadda and the other 110 do not.
    const { container } = render(<MushafPage {...props} lines={openingLines} />);
    expect(container.textContent).toContain(BASMALA);
  });

  it('draws the basmala alone, not the whole of ayah 1 behind it', () => {
    // The device run: the row is basmala + the surah's first words, and the
    // line drew all of it, ellipsised. The line holds the basmala only.
    render(<MushafPage {...props} lines={openingLines} />);
    const bismillah = screen.getByLabelText('In the name of Allah, the Entirely Merciful, the Especially Merciful');
    expect(bismillah.textContent).toBe(BASMALA);
  });

  it('keeps 15 line slots on a page whose words occupy fewer', () => {
    // The grid is what makes a page a page; a short page must not stretch its
    // lines to fill the height.
    const { container } = render(<MushafPage {...props} page={604} lines={plainLines} />);
    expect(lineBoxesOf(container)).toHaveLength(15);
  });

  it('gives every slot the same height, blanks included', () => {
    const { container } = render(<MushafPage {...props} />);
    const heights = new Set(
      Array.from(lineBoxesOf(container)).map((node) => (node as HTMLElement).style.height),
    );
    expect(heights.size).toBe(1);
  });

  it('shows the page number and its juz in the footer', () => {
    const { container } = render(<MushafPage {...props} />);
    expect(container.textContent).toContain('106');
    expect(screen.getByLabelText(/Page 106/)).toBeTruthy();
  });
});
