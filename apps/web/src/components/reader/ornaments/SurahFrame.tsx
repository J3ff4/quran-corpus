import type { ReactNode } from 'react';

import {
  SURAH_BAND_MEDALLIONS,
  SURAH_BAND_NUMERAL_SIZE,
  SURAH_BAND_PATH,
  SURAH_BAND_VIEW_BOX,
  toEasternArabicNumeral,
} from '@quran-corpus/config/ornaments/surahBand';

interface SurahFrameProps {
  children: ReactNode;
  surahNumber: number;
  className?: string;
}

/**
 * Wide arabesque banner enclosing the surah name. Geometry and the notes on
 * the art itself live in `@quran-corpus/config/ornaments/surahBand` -- the
 * mobile mushaf page draws the same band (M7c ruling 21). Recolored via
 * `currentColor` (was a hardcoded #005aff) so a wrapping text-color class
 * drives paper/night theming (CLAUDE.md §8).
 *
 * Content is centered via `inset-x`/`inset-y` (not padding): CSS resolves
 * padding-top/bottom percentages against the containing block's WIDTH
 * regardless of axis, which on this 8.16:1 frame overshoots the actual
 * height and pushes content out below the frame. Absolute-position offsets
 * (top/bottom/left/right) resolve per-axis correctly, so inset-y is safe.
 *
 * ponytail: callers' glyph text tops out around text-2xl -- the 8.16:1
 * aspect ratio only budgets ~26px of safe vertical space at the narrowest
 * common phone width (~320px viewport), so much bigger overflows the frame
 * again. To go bigger without that ceiling, make the frame less wide/short
 * (change the aspect ratio) or size the glyph via a container query against
 * the frame's own box instead of a fixed text size (needs the Tailwind
 * container-queries plugin, not installed).
 *
 * The medallion positions below come from the subpath bounding boxes noted in
 * that shared module. RTL reading starts on the right, so the Eastern
 * Arabic-Indic numeral sits in the right medallion and the Western numeral in
 * the left one.
 */
// Percentages off the shared fractions, so the mushaf page and this frame
// cannot drift apart on geometry neither of them measured.
const pct = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;
const medallionBase = {
  top: pct(SURAH_BAND_MEDALLIONS.top),
  height: pct(SURAH_BAND_MEDALLIONS.height),
  width: pct(SURAH_BAND_MEDALLIONS.width),
} as const;
// kfgqpc (font-arabic's primary face) substitutes its own decorative
// ayah-end roundel for plain digit glyphs, which reads as a second medallion
// nested in the frame's medallion. Amiri has plain Eastern Arabic-Indic digit
// forms, so it's referenced directly here instead of the font-arabic class.
const rightMedallionStyle = {
  ...medallionBase,
  left: pct(SURAH_BAND_MEDALLIONS.easternLeft),
  fontFamily: "'Amiri', 'Amiri Fallback'",
};
const leftMedallionStyle = { ...medallionBase, left: pct(SURAH_BAND_MEDALLIONS.westernLeft) };

export function SurahFrame({ children, surahNumber, className }: SurahFrameProps) {
  // 1-2 digit surah numbers (1-99) read as visually smaller than the
  // 3-digit ones (100-114) at the same font size, so they get a 10% bump;
  // 3-digit numbers keep the base size.
  const westernFontSize = String(surahNumber).length <= 2 ? '0.561rem' : '0.51rem';
  // Inverse for the Eastern numeral: 3-digit ones read too big at the base
  // size, so they get an 8% reduction; 1-2 digit numbers keep the base size.
  const easternFontSize = String(surahNumber).length === 3 ? '0.782rem' : '0.85rem';
  return (
    <div
      className={`relative mx-auto aspect-[204/25] w-full max-w-md text-paper-700/80 dark:text-paper-300/70 ${className ?? ''}`.trim()}
    >
      <svg
        viewBox={SURAH_BAND_VIEW_BOX}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <path fill="currentColor" d={SURAH_BAND_PATH} />
      </svg>
      <div className="absolute inset-x-[28%] inset-y-[14%] flex items-center justify-center text-center">
        {children}
      </div>
      <span
        aria-hidden="true"
        style={{ ...rightMedallionStyle, fontSize: easternFontSize }}
        className="absolute flex items-center justify-center leading-none tabular-nums"
      >
        {toEasternArabicNumeral(surahNumber)}
      </span>
      <span
        aria-hidden="true"
        style={{ ...leftMedallionStyle, fontSize: westernFontSize }}
        className="absolute flex items-center justify-center font-sans leading-none tabular-nums"
      >
        {surahNumber}
      </span>
      <span className="sr-only">Surah {surahNumber}</span>
    </div>
  );
}
