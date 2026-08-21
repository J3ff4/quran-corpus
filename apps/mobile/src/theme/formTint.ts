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
