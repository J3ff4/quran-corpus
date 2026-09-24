import { describe, expect, it } from 'vitest';
import { measuredRows } from './rowHeightFixture';
import { estimateRowHeight, type RowHeightInput } from './rowHeightModel';

// The reference width the coefficients were fitted at (ROW-HEIGHT-SPIKE.md).
const TRANSLATION_W = 360;

describe('estimateRowHeight', () => {
  it('matches the measured device rows within the spike error bound', () => {
    const errors = measuredRows.map((row) => estimateRowHeight(row) - row.height);
    const rms = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length);

    // 39.2dp over the 2026-09-23 rows. The landing loop corrects against a
    // real measurement before the list is ever revealed, so what the model
    // owes is a starting point close enough to window the right rows.
    expect(rms).toBeLessThan(45);
  });

  it('does not lean one way', () => {
    // The defect that made the re-fit necessary, and the one an rms bound
    // cannot see. The 2026-09-06 coefficients underran EVERY row -- mean
    // error -82dp, and -117dp at Arabic size 42 -- so a scrollToIndex deep in
    // a surah summed hundreds of rows of error all pointing the same way. A
    // model with the same rms and no bias lands far closer.
    const bias = (rows: typeof measuredRows) =>
      rows.reduce((sum, row) => sum + (estimateRowHeight(row) - row.height), 0) / rows.length;

    expect(Math.abs(bias(measuredRows))).toBeLessThan(10);
    // Per size too: one size-squared coefficient has to serve all four, so a
    // bias that cancels overall while leaning one way at each end would mean
    // the square law itself is wrong.
    for (const arabicSize of [22, 28, 35, 42]) {
      const rows = measuredRows.filter((row) => row.arabicSize === arabicSize);
      expect(rows.length).toBeGreaterThan(20);
      expect(Math.abs(bias(rows))).toBeLessThan(15);
    }
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

  it('drops the translation block whole when there is no translation', () => {
    // The bias the fixture cannot catch: every measured row HAS a translation,
    // so the fit folded that block's own furniture -- the card gap, the
    // paddingTop and the rule -- into the chrome constant. With the
    // translation switched off it was still being charged for, on every row,
    // in the same direction, and the offset table ran long by the sum of it.
    const withNone = estimateRowHeight({
      arabicSize: 28, listWidth: TRANSLATION_W,
      arabicChars: 500, translationChars: 0,
    });
    const withOne = estimateRowHeight({
      arabicSize: 28, listWidth: TRANSLATION_W,
      arabicChars: 500, translationChars: 1,
    });
    // A one-character translation costs a whole block plus one character, so
    // the step at zero is the furniture itself -- not a rounding difference.
    expect(withOne - withNone).toBeGreaterThan(20);
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
