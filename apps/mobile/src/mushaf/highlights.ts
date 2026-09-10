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

/** How far each state pulls the text toward the accent. A bookmark is a quiet
 *  standing mark; a landing pulse is louder but still short of the accent, so
 *  a playing ayah stays the strongest thing on the page (ruling 20). */
const BOOKMARK_TINT = 0.45;
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
 * One colour per word, resolved from the four highlight states that can all be
 * true at once (ruling 20, and M7d ruling 4). Precedence, strongest first:
 * **pressed -> audio -> landing -> bookmark -> plain text.**
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
  const bookmarkColor = mix(theme.text, theme.accent, BOOKMARK_TINT);
  const pressed = input.pressed;
  return (surahId, ayahNumber, position) => {
    if (isPressed(pressed, surahId, ayahNumber, position)) return theme.accent;
    const key = ayahKey(surahId, ayahNumber);
    if (input.playing === key) return theme.accent;
    const base = input.bookmarked.has(key) ? bookmarkColor : theme.text;
    if (input.landing === key) return mix(base, theme.accent, LANDING_PEAK * input.landingProgress);
    return base;
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
 * The ground a word sits on: a wash under the pressed word, nothing anywhere
 * else.
 *
 * Colour alone cannot carry this state. A pressed word takes the accent, and
 * so does a playing one -- press a word inside the ayah being recited and the
 * two would be indistinguishable, which is exactly the moment the mark has to
 * be readable. The wash is what separates them, and it is also the only one of
 * the four states that says "this word", not "this verse".
 */
export function backgroundForWord(
  input: HighlightInput,
  theme: typeof themeColors.light,
): (surahId: number, ayahNumber: number, position: number) => string | undefined {
  const pressed = input.pressed;
  if (pressed === null) return () => undefined;
  return (surahId, ayahNumber, position) =>
    isPressed(pressed, surahId, ayahNumber, position) ? theme.accentWash : undefined;
}
