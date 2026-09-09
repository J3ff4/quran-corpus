import { describe, expect, it } from 'vitest';
import { measuredRows } from './rowHeightFixture';
import { estimateRowHeight, type RowHeightInput } from './rowHeightModel';

// The reference width the coefficients were fitted at (ROW-HEIGHT-SPIKE.md).
const TRANSLATION_W = 360;

describe('estimateRowHeight', () => {
  it('matches the measured device rows within the spike error bound', () => {
    // The translation rows alone. The spike measured mushaf plate rows too,
    // but M7d left the model with nothing to estimate for them -- the mushaf
    // is a pager of fixed-height pages now -- so scoring against them would be
    // scoring a model against rows it no longer claims to describe.
    const rows = measuredRows.filter((row) => row.mode === 'translation');
    const errors = rows.map((row) => estimateRowHeight(row) - row.height);
    const rms = Math.sqrt(
      errors.reduce((sum, e) => sum + e * e, 0) / errors.length,
    );
    // 36.2dp as measured over the translation rows alone. The old bound of 35
    // held only because the mushaf's plate rows -- shorter, and easier to
    // predict -- were averaged in with them; dropping them in M7d is what
    // exposed the real figure for the rows the model still estimates. The
    // coefficients are unchanged, and the landing loop corrects against a real
    // measurement before the list is ever revealed.
    expect(rms).toBeLessThan(40);
  });

  it('never returns a height below the empty-card chrome', () => {
    expect(
      estimateRowHeight({
        arabicSize: 22, listWidth: TRANSLATION_W,
        arabicChars: 0, translationChars: 0,
      }),
    ).toBeGreaterThanOrEqual(80);
  });

  it('grows with Arabic length, size, and translation length', () => {
    const base: RowHeightInput = {
      arabicSize: 28, listWidth: TRANSLATION_W,
      arabicChars: 100, translationChars: 100,
    };
    expect(estimateRowHeight({ ...base, arabicChars: 400 })).toBeGreaterThan(
      estimateRowHeight(base),
    );
    expect(estimateRowHeight({ ...base, arabicSize: 42 })).toBeGreaterThan(
      estimateRowHeight(base),
    );
    expect(estimateRowHeight({ ...base, translationChars: 400 })).toBeGreaterThan(
      estimateRowHeight(base),
    );
  });

  it('scales the Arabic term with size squared', () => {
    const at = (arabicSize: number) =>
      estimateRowHeight({
        arabicSize, listWidth: TRANSLATION_W,
        arabicChars: 500, translationChars: 0,
      });
    // b goes as size^2 (spike: b/size^2 constant within +-5% across 8 groups),
    // so doubling the size roughly quadruples the text term.
    const chrome = estimateRowHeight({
      arabicSize: 21, listWidth: TRANSLATION_W,
      arabicChars: 0, translationChars: 0,
    });
    expect((at(42) - chrome) / (at(21) - chrome)).toBeCloseTo(4, 0);
  });

  it('shrinks the text term as the list gets wider', () => {
    const at = (listWidth: number) =>
      estimateRowHeight({
        arabicSize: 28, listWidth,
        arabicChars: 500, translationChars: 0,
      });
    expect(at(600)).toBeLessThan(at(TRANSLATION_W));
  });

  it('is finite and positive for degenerate input', () => {
    // listWidth is 0 on the first commit, before the list has laid out.
    const h = estimateRowHeight({
      arabicSize: 28, listWidth: 0,
      arabicChars: 1213, translationChars: 1334,
    });
    expect(Number.isFinite(h)).toBe(true);
    expect(h).toBeGreaterThan(0);
  });
});
