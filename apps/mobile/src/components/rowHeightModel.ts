import type { ReaderMode } from '@/settings/settingsStore';

export interface RowHeightInput {
  mode: ReaderMode;
  /** The reader's Arabic font size in dp -- useArabicSizes().reader. */
  arabicSize: number;
  /** The FlatList's own width. 0 before it has laid out. */
  listWidth: number;
  arabicChars: number;
  /** 0 in mushaf mode, where no translation is drawn. */
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
// measurements (92..101dp mushaf, 169..174dp translation), so it is a constant
// and the residual rides in the text term.
const CHROME_DP: Record<ReaderMode, number> = { mushaf: 94, translation: 170 };

// dp per Arabic character, at REFERENCE_WIDTH. Scales with size^2: line height
// grows with the size while characters per line fall as 1/size, so the
// per-character area goes as the square. Measured b/size^2 sits between
// 1.058e-3 and 1.108e-3 across all eight (mode, size) groups.
const ARABIC_DP_PER_CHAR_PER_SQ_DP = 0.00108;

// dp per translation character. Independent of the Arabic size (measured
// 0.70..0.78 across all four), because the English block never scales with it.
const TRANSLATION_DP_PER_CHAR = 0.72;

// The widths the coefficients were fitted at: the mushaf plate is inset, the
// translation card is not.
const REFERENCE_WIDTH: Record<ReaderMode, number> = { mushaf: 334, translation: 360 };

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
  mode,
  arabicSize,
  listWidth,
  arabicChars,
  translationChars,
}: RowHeightInput): number {
  const reference = REFERENCE_WIDTH[mode];
  // Characters per line scale with the width, so dp per character scales with
  // its inverse. Only two widths were measured and they are confounded with
  // mode, so this half of the law is unverified -- the correction pass is what
  // makes that safe. Guarded because listWidth is 0 on the first commit.
  const widthFactor = listWidth > 0 ? reference / listWidth : 1;

  const arabic =
    ARABIC_DP_PER_CHAR_PER_SQ_DP * arabicSize * arabicSize * arabicChars * widthFactor;
  const translation =
    mode === 'translation' ? TRANSLATION_DP_PER_CHAR * translationChars * widthFactor : 0;

  return CHROME_DP[mode] + arabic + translation;
}
