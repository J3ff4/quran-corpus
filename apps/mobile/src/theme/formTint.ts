import { categorizeFormLabel } from '@quran-corpus/data/mobile';
import type { themeColors } from './tokens';

type Theme = (typeof themeColors)['light'];

/** 16% of the colour over whatever is behind it, as an 8-digit hex.
 *
 *  React Native has no `color-mix()`, which is what web's chips use, and the
 *  palette's second contrast figure is measured at exactly 16% -- so the alpha
 *  is fixed here rather than passed in. Nothing may paint behind a tinted pill:
 *  the ratio assumes the page (or card) is directly underneath. */
export function formTint(color: string): string {
  return color.length > 7 ? color : `${color}29`;
}

/** The colour a derived form's label is drawn in, plus its pill background. */
export function formColorFor(theme: Theme, posLabel: string): { color: string; tint: string } {
  const color = theme.form[categorizeFormLabel(posLabel)];
  return { color, tint: formTint(color) };
}

/** The colour a morphological segment's label is drawn in, plus its pill
 *  background -- or `undefined` where the corpus surfaces no bucket for the
 *  tag, in which case the pill stays untinted rather than asserting a
 *  category it does not have.
 *
 *  Same 16% as the form chips, and measured the same way: on the sheet's own
 *  surface the lowest POS ratio on its own tint is 4.78:1, and on a glass
 *  group inside it 5.76:1 (dark) -- both clear AA. Nothing may paint behind
 *  the tint beyond that group. */
export function posColorFor(
  theme: Theme,
  bucket: keyof Theme['pos'] | null,
): { color: string; tint: string | undefined } {
  if (bucket === null) return { color: theme.text, tint: undefined };
  const color = theme.pos[bucket];
  return { color, tint: formTint(color) };
}
