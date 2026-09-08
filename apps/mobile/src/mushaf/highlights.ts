import type { themeColors } from '@/theme/tokens';

export interface HighlightInput {
  /** `${surahId}:${ayahNumber}` keys. */
  bookmarked: ReadonlySet<string>;
  landing: string | null;
  playing: string | null;
  /** 1 at the pulse's peak, 0 once faded. */
  landingProgress: number;
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
 * One colour per ayah, resolved from the three highlight states that can all
 * be true at once (ruling 20). Precedence, strongest first:
 * **audio -> landing -> bookmark -> plain text.** Audio wins because it is the
 * one that moves, and a landing pulse under a playing ayah would fight it.
 */
export function colorForAyah(
  input: HighlightInput,
  theme: typeof themeColors.light,
): (surahId: number, ayahNumber: number) => string {
  const bookmarkColor = mix(theme.text, theme.accent, BOOKMARK_TINT);
  return (surahId, ayahNumber) => {
    const key = ayahKey(surahId, ayahNumber);
    if (input.playing === key) return theme.accent;
    const base = input.bookmarked.has(key) ? bookmarkColor : theme.text;
    if (input.landing === key) return mix(base, theme.accent, LANDING_PEAK * input.landingProgress);
    return base;
  };
}
