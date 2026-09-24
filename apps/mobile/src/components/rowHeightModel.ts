export interface RowHeightInput {
  /** The reader's Arabic font size in dp -- useArabicSizes().reader. */
  arabicSize: number;
  /** The FlatList's own width. 0 before it has laid out. */
  listWidth: number;
  arabicChars: number;
  /** 0 when the reader is drawing no translation. */
  translationChars: number;
}

// Every number here is fitted from the device run of 2026-09-23 -- see
// apps/mobile/scripts/ROW-HEIGHT-SPIKE.md, section 3. The plain linear form is
// used rather than a line-count form (`a + b * ceil(chars / cpl)`) because it
// scored the same or better on every group while staying interpretable: the
// line-count fits were degenerate, putting cpl at 58 in one group and 10 in the
// next for indistinguishable error.
//
// The card's fixed furniture. Barely moves with Arabic size in the
// measurements, so it is a constant and the residual rides in the text term.
// The fit had a second value for the mushaf's plate rows, dropped in M7d along
// with the mode itself: the mushaf is a pager of fixed-height pages now and
// nothing estimates its rows.
const CHROME_DP = 145;

// The translation block's own fixed furniture, on top of CHROME_DP: the card's
// 14dp gap above it, its own 14dp paddingTop, and the 1dp rule between the two
// scripts (AyahCard). Split out of CHROME_DP rather than folded into the
// per-character term, because it is there in full for a one-word translation
// and gone entirely when there is none.
//
// 145 + 29 is the 174 the fixture was fitted at, so every row that draws a
// translation estimates exactly as before. What changes is the rows that do
// not: the fixture contains no row with translationChars 0 -- the fit never
// saw one -- so with the translation switched off every row carried 29dp of
// furniture that is not on screen, one-directionally and cumulatively. That is
// the same bias class the 2026-09-23 re-fit exists to remove: over 286 rows of
// al-Baqara it ran the offset table ~8000dp long.
const TRANSLATION_BLOCK_DP = 29;

// dp per Arabic character, at REFERENCE_WIDTH. Scales with size^2: line height
// grows with the size while characters per line fall as 1/size, so the
// per-character area goes as the square. One value across all four sizes
// leaves a per-size bias under 2dp, so the square law itself still holds --
// what moved is the constant, by 27%, when the reader took an explicit
// lineHeight on the Arabic run.
const ARABIC_DP_PER_CHAR_PER_SQ_DP = 0.001371;

// dp per translation character. Independent of the Arabic size, because the
// English block never scales with it.
const TRANSLATION_DP_PER_CHAR = 0.8447;

// The width the coefficients were fitted at.
const REFERENCE_WIDTH = 360;

/**
 * An estimate of one ayah row's height, for `getItemLayout`.
 *
 * Deliberately an estimate -- 39dp rms per row against the measured fixture,
 * worst single row 117dp -- so the caller must correct against a real
 * measurement before it reveals the list: see the landing loop in
 * SurahReader.tsx. The 2026-09-06 coefficients it replaces were not merely
 * imprecise but biased, underrunning EVERY row by 55dp at Arabic size 22 and
 * 117dp at size 42, so the drift accumulated in one direction the whole way
 * down a surah. What this buys is a
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
  // The block is drawn or it is not; there is no half of it. AyahCard renders
  // it on a non-empty translation, which is exactly translationChars > 0.
  const translation =
    translationChars > 0
      ? TRANSLATION_BLOCK_DP + TRANSLATION_DP_PER_CHAR * translationChars * widthFactor
      : 0;

  return CHROME_DP + arabic + translation;
}
