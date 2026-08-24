/**
 * jsdom normalizes an inline hex colour to `rgb(r, g, b)`, so a hex compared
 * straight against `style.color` never matches -- including when the colour
 * is wrong. Two suites had each grown their own copy of this conversion.
 */
export function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Flatten an `rgba(r, g, b, a)` layer onto an opaque `#rrggbb` backdrop.
 *
 * Fake glass is a translucent fill, so the colour a user actually reads text
 * against exists nowhere in the token file -- it is the fill over whatever the
 * bloom put behind it. Without this, every contrast assertion measures a
 * backdrop that never appears on screen.
 */
export function composite(layer: string, backdrop: string): string {
  const match = /^rgba?\(([^)]+)\)$/.exec(layer.trim());
  if (!match?.[1]) throw new Error(`composite expects rgba(), got ${layer}`);

  const parts = match[1].split(',').map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`composite could not parse ${layer}`);
  }

  const [r, g, b, a = 1] = parts as [number, number, number, number?];
  const back = [1, 3, 5].map((i) => parseInt(backdrop.slice(i, i + 2), 16));
  const mix = [r, g, b].map((channel, i) => Math.round(channel * a + back[i]! * (1 - a)));
  return `#${mix.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
