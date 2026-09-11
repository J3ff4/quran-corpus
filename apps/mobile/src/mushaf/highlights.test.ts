import { describe, expect, it } from 'vitest';

import { themeColors } from '@/theme/tokens';

import { ayahKey, backgroundForWord, colorForWord } from './highlights';

const theme = themeColors.light;
const base = {
  bookmarked: new Set<string>(),
  landing: null,
  playing: null,
  landingProgress: 0,
  pressed: null,
};

describe('colorForWord', () => {
  it('leaves an ordinary ayah in the page-s text colour', () => {
    expect(colorForWord(base, theme)(2, 5, 1)).toBe(theme.text);
  });

  it('leaves a bookmarked ayah-s ink alone -- the band carries it now', () => {
    // The owner read the old green type as "very vague" (2026-09-10): it was
    // one of three greens on the page and the quietest of them. Ink stays ink.
    const c = colorForWord({ ...base, bookmarked: new Set([ayahKey(2, 5)]) }, theme);
    expect(c(2, 5, 1)).toBe(theme.text);
  });

  it('lets audio win over a landing pulse and a bookmark on the same ayah', () => {
    // Ruling 20 puts all three on one ayah. The playing ayah is the one that
    // moves, so it has to stay legible as it moves.
    const all = {
      bookmarked: new Set([ayahKey(2, 5)]),
      landing: ayahKey(2, 5),
      playing: ayahKey(2, 5),
      landingProgress: 1,
      pressed: null,
    };
    expect(colorForWord(all, theme)(2, 5, 1)).toBe(theme.accent);
  });

  it('pulses a landing ayah above the page, bookmarked or not', () => {
    const bookmarked = new Set([ayahKey(2, 5)]);
    const c = colorForWord({ ...base, bookmarked, landing: ayahKey(2, 5), landingProgress: 1 }, theme);
    expect(c(2, 5, 1)).not.toBe(theme.text);
    // Short of the accent, so a playing ayah is still the loudest thing there.
    expect(c(2, 5, 1)).not.toBe(theme.accent);
  });

  it('returns to plain ink once the pulse has faded out', () => {
    const withBookmark = { ...base, bookmarked: new Set([ayahKey(2, 5)]) };
    const faded = colorForWord({ ...withBookmark, landing: ayahKey(2, 5), landingProgress: 0 }, theme);
    expect(faded(2, 5, 1)).toBe(theme.text);
  });

  it('keys on the surah too, so a page crossing a boundary tints one ayah', () => {
    const c = colorForWord({ ...base, playing: ayahKey(78, 5) }, theme);
    expect(c(78, 5, 1)).toBe(theme.accent);
    expect(c(77, 5, 1)).toBe(theme.text);
  });

  it('survives a spring overshooting past the pulse-s peak', () => {
    // landingProgress comes off a spring, which overshoots 1. Unclamped that
    // walks the channels past the accent and can leave the byte range, which
    // renders as an invalid colour rather than as a loud one.
    const c = colorForWord({ ...base, landing: ayahKey(2, 5), landingProgress: 1.4 }, theme)(2, 5, 1);
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(c).toBe(colorForWord({ ...base, landing: ayahKey(2, 5), landingProgress: 1 / 0.8 }, theme)(2, 5, 1));
  });

  it('marks the pressed word over every other state, and only that word', () => {
    // M7d ruling 4: a long press opens the sheet, so something has to say
    // which word it is about. Press a word inside the ayah being recited and
    // the colour alone cannot -- both are the accent -- which is why the wash
    // is what carries it.
    const pressed = { surahId: 2, ayahNumber: 5, position: 3 };
    const input = { ...base, playing: ayahKey(2, 5), pressed };

    const color = colorForWord(input, theme);
    const background = backgroundForWord(input, theme);

    expect(background(2, 5, 3)).toBe(theme.accentWash);
    // Its neighbours in the same ayah keep the playing colour and no wash.
    expect(color(2, 5, 4)).toBe(theme.accent);
    expect(background(2, 5, 4)).toBeUndefined();
  });

  it('takes the pressed word to the accent over a state that is not the accent', () => {
    // Deliberately WITHOUT audio. The first version of the test above asserted
    // the pressed colour on a playing ayah, where the accent is what `playing`
    // returns anyway -- deleting the whole pressed branch left it green.
    const bookmarked = new Set([ayahKey(2, 5)]);
    const pressed = { surahId: 2, ayahNumber: 5, position: 3 };
    const color = colorForWord({ ...base, bookmarked, pressed }, theme);

    expect(color(2, 5, 3)).toBe(theme.accent);
    expect(color(2, 5, 4)).toBe(theme.text);
  });

  it('washes nothing at all while nothing is pressed or bookmarked', () => {
    const background = backgroundForWord(base, theme);
    expect(background(2, 5, 1)).toBeUndefined();
  });

  it('bands every word of a bookmarked ayah, and only that ayah', () => {
    const background = backgroundForWord({ ...base, bookmarked: new Set([ayahKey(2, 5)]) }, theme);

    expect(background(2, 5, 1)).toBe(theme.bookmarkWash);
    expect(background(2, 5, 9)).toBe(theme.bookmarkWash);
    expect(background(2, 6, 1)).toBeUndefined();
    // The surah too: 51 pages cross a boundary and an ayah number alone would
    // band the wrong verse on one.
    expect(background(3, 5, 1)).toBeUndefined();
  });

  it('keeps the bookmark band clear of the accent wash it sits under', () => {
    // Two grounds, and the pressed one has to be visible ON the other. Equal
    // tokens would make a long press inside a bookmarked ayah do nothing at
    // all on screen -- which is the only feedback there is that the sheet is
    // coming (M7d ruling 4, 500ms).
    expect(theme.bookmarkWash).not.toBe(theme.accentWash);
  });

  it('lets the pressed word-s wash win over the band it sits on', () => {
    const background = backgroundForWord(
      {
        ...base,
        bookmarked: new Set([ayahKey(2, 5)]),
        pressed: { surahId: 2, ayahNumber: 5, position: 3 },
      },
      theme,
    );

    expect(background(2, 5, 3)).toBe(theme.accentWash);
    // Its neighbours keep the band rather than losing it to the press.
    expect(background(2, 5, 2)).toBe(theme.bookmarkWash);
  });

  it('does not carry a press across a surah boundary on a shared page', () => {
    const background = backgroundForWord(
      { ...base, pressed: { surahId: 5, ayahNumber: 1, position: 2 } },
      theme,
    );
    expect(background(5, 1, 2)).toBe(theme.accentWash);
    expect(background(4, 1, 2)).toBeUndefined();
  });
});
