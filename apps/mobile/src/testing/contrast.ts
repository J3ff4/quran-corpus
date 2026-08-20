/**
 * WCAG relative-luminance contrast ratio between two `#rrggbb` colours.
 *
 * Lives here rather than beside one suite because the ratios in
 * `theme/tokens.ts` are written as comments, and a comment is not a gate: the
 * only thing that stops an edited hex from silently dropping under AA is a
 * test that recomputes it. Two suites now need that, which is one more than a
 * private copy survives (see `rgb.ts` for how that goes).
 */
export function contrast(hex: string, bg: string): number {
  const channel = (h: string, i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (h: string) =>
    0.2126 * channel(h, 1) + 0.7152 * channel(h, 3) + 0.0722 * channel(h, 5);
  const [hi, lo] = [lum(hex), lum(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}
