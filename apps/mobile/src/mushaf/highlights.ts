import type { themeColors } from '@/theme/tokens';

export interface HighlightInput {
  /** `${surahId}:${ayahNumber}` keys. */
  bookmarked: ReadonlySet<string>;
  landing: string | null;
  playing: string | null;
  /** 1 at the pulse's peak, 0 once faded. */
  landingProgress: number;
  /** The word under a long press, or null. The only per-WORD state there is:
   *  the other three mark an ayah, and this one has to say which of its words
   *  the sheet about to open is about (M7d ruling 4). */
  pressed: PressedWord | null;
}

export interface PressedWord {
  surahId: number;
  ayahNumber: number;
  position: number;
}

/** Keys are strings, not ayah numbers: 51 pages cross a surah boundary, so an
 *  ayah number alone is ambiguous and a Set of numbers would tint the wrong
 *  verse on a shared page. */
export function ayahKey(surahId: number, ayahNumber: number): string {
  return `${surahId}:${ayahNumber}`;
}

/** How far a landing pulse pulls the text toward the accent. Louder than the
 *  page but still short of the accent, so a playing ayah stays the strongest
 *  thing there (ruling 20).
 *
 *  A bookmark used to have a figure here too -- 0.45 toward the accent -- and
 *  it does not any more: it is a band under the words now, not a colour on
 *  them. See `backgroundForWord`. */
const LANDING_PEAK = 0.8;

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** `t` of `to` over `from`, as a 6-digit hex. Deliberately not rgba(): these
 *  are glyph colours on a page whose background differs per theme, and a
 *  translucent colour over the QCF run would composite differently on the
 *  surah band than on the page. */
function mix(from: string, to: string, t: number): string {
  const [r1, g1, b1] = channels(from);
  const [r2, g2, b2] = channels(to);
  const k = Math.min(1, Math.max(0, t));
  const byte = (a: number, b: number) =>
    Math.round(a + (b - a) * k)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(r1, r2)}${byte(g1, g2)}${byte(b1, b2)}`;
}

/**
 * One colour per word. Precedence, strongest first:
 * **pressed -> audio -> landing -> plain text.**
 *
 * A bookmark is absent from this list on purpose. It is the one state that
 * stands for weeks rather than for a gesture or a playhead, and as a fourth
 * shade of green it was indistinguishable from the other two -- so it moved
 * out of the ink and under it (owner, 2026-09-10). See `backgroundForWord`.
 *
 * Pressed wins over audio, which wins over everything else: it is the only
 * state the reader is causing at this instant, and its whole job is to say
 * which word the sheet that is opening belongs to. Audio comes next because it
 * is the one that moves on its own, and a landing pulse under a playing ayah
 * would fight it.
 *
 * A word, not an ayah: three of the four states mark a whole ayah and the
 * fourth marks one word inside it, so the ayah-shaped signature could not
 * express the new one at all.
 */
export function colorForWord(
  input: HighlightInput,
  theme: typeof themeColors.light,
): (surahId: number, ayahNumber: number, position: number) => string {
  const pressed = input.pressed;
  return (surahId, ayahNumber, position) => {
    if (isPressed(pressed, surahId, ayahNumber, position)) return theme.accent;
    const key = ayahKey(surahId, ayahNumber);
    if (input.playing === key) return theme.accent;
    // A bookmark no longer appears here at all: it is the band underneath.
    if (input.landing === key) {
      return mix(theme.text, theme.accent, LANDING_PEAK * input.landingProgress);
    }
    return theme.text;
  };
}

function isPressed(
  pressed: PressedWord | null,
  surahId: number,
  ayahNumber: number,
  position: number,
): boolean {
  return (
    pressed !== null &&
    pressed.surahId === surahId &&
    pressed.ayahNumber === ayahNumber &&
    pressed.position === position
  );
}

/**
 * The ground a word sits on: the amber band of a bookmarked ayah, and the
 * accent wash under the one word being pressed.
 *
 * Both live here because both are grounds, and one sits on the other: press a
 * word inside a bookmarked ayah and the green wash has to win over the amber
 * band for that word only. Colour alone cannot carry either state -- a pressed
 * word takes the accent and so does a playing one, and a bookmark competing in
 * ink with those two is the "very vague" mark this replaces.
 *
 * The words of a line are adjacent runs of one <Text> joined with no space
 * (see MushafLineRow), so a per-word background paints as one unbroken band
 * across the ayah rather than as a row of separate rectangles.
 */
export function backgroundForWord(
  input: HighlightInput,
  theme: typeof themeColors.light,
): (surahId: number, ayahNumber: number, position: number) => string | undefined {
  const pressed = input.pressed;
  const { bookmarked } = input;
  // Nothing to draw at all: hand back one closure rather than run two lookups
  // per word on every page that has neither.
  if (pressed === null && bookmarked.size === 0) return () => undefined;
  return (surahId, ayahNumber, position) => {
    if (isPressed(pressed, surahId, ayahNumber, position)) return theme.accentWash;
    return bookmarked.has(ayahKey(surahId, ayahNumber)) ? theme.bookmarkWash : undefined;
  };
}
