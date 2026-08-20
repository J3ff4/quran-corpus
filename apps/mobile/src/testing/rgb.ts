/**
 * jsdom normalizes an inline hex colour to `rgb(r, g, b)`, so a hex compared
 * straight against `style.color` never matches -- including when the colour
 * is wrong. Two suites had each grown their own copy of this conversion.
 */
export function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
