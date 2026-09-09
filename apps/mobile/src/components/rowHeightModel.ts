export interface RowHeightInput {
  /** The reader's Arabic font size in dp -- useArabicSizes().reader. */
  arabicSize: number;
  /** The FlatList's own width. 0 before it has laid out. */
  listWidth: number;
  arabicChars: number;
  /** 0 when the reader is drawing no translation. */
  translationChars: number;
}

// Every number here is fitted from the device run of 2026-09-06 -- see
// apps/mobile/scripts/ROW-HEIGHT-SPIKE.md, section 2. The plain linear form is
// used rather than a line-count form (`a + b * ceil(chars / cpl)`) because it
// scored the same or better on every group while staying interpretable: the
// line-count fits were degenerate, putting cpl at 58 in one group and 10 in the
// next for indistinguishable error.
//
// The card's fixed furniture. Barely moves with Arabic size in the
// measurements (169..174dp), so it is a constant and the residual rides in the
// text term. The fit had a second value for the mushaf's plate rows, dropped
// in M7d along with the mode itself: the mushaf is a pager of fixed-height
// pages now and nothing estimates its rows.
const CHROME_DP = 170;

// dp per Arabic character, at REFERENCE_WIDTH. Scales with size^2: line height
// grows with the size while characters per line fall as 1/size, so the
// per-character area goes as the square. Measured b/size^2 sits between
// 1.058e-3 and 1.108e-3 across all eight (mode, size) groups.
const ARABIC_DP_PER_CHAR_PER_SQ_DP = 0.00108;

// dp per translation character. Independent of the Arabic size (measured
// 0.70..0.78 across all four), because the English block never scales with it.
const TRANSLATION_DP_PER_CHAR = 0.72;

// The width the coefficients were fitted at.
const REFERENCE_WIDTH = 360;

/**
 * An estimate of one ayah row's height, for `getItemLayout`.
 *
 * Deliberately an estimate. Worst cumulative drift over Al-Baqara was 512dp,
 * so the caller must correct against a real measurement before it reveals the
 * list -- see the landing loop in SurahReader.tsx. What this buys is a
 * FlatList that can jump to any index without first rendering everything above
 * it, which is what the old `initialNumToRender = initialIndex + 1` was for.
 */
export function estimateRowHeight({
  arabicSize,
  listWidth,
  arabicChars,
  translationChars,
}: RowHeightInput): number {
  // Characters per line scale with the width, so dp per character scales with
  // its inverse. Only two widths were measured, so this half of the law is
  // unverified -- the correction pass is what makes that safe. Guarded because
  // listWidth is 0 on the first commit.
  const widthFactor = listWidth > 0 ? REFERENCE_WIDTH / listWidth : 1;

  const arabic =
    ARABIC_DP_PER_CHAR_PER_SQ_DP * arabicSize * arabicSize * arabicChars * widthFactor;
  const translation = TRANSLATION_DP_PER_CHAR * translationChars * widthFactor;

  return CHROME_DP + arabic + translation;
}
