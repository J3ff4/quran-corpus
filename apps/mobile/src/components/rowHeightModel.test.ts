import { describe, expect, it } from 'vitest';
import { measuredRows } from './rowHeightFixture';
import { estimateRowHeight, type RowHeightInput } from './rowHeightModel';

// The reference width each coefficient was fitted at (ROW-HEIGHT-SPIKE.md).
const MUSHAF_W = 334;
const TRANSLATION_W = 360;

describe('estimateRowHeight', () => {
  it('matches the measured device rows within the spike error bound', () => {
    const errors = measuredRows.map((row) => estimateRowHeight(row) - row.height);
    const rms = Math.sqrt(
      errors.reduce((sum, e) => sum + e * e, 0) / errors.length,
    );
    // Worst per-group rms in the spike was 30.0dp (translation, size 42).
    expect(rms).toBeLessThan(35);
  });

  it('never returns a height below the empty-card chrome', () => {
    expect(
      estimateRowHeight({
        mode: 'mushaf', arabicSize: 22, listWidth: MUSHAF_W,
        arabicChars: 0, translationChars: 0,
      }),
    ).toBeGreaterThanOrEqual(80);
  });

  it('grows with Arabic length, size, and translation length', () => {
    const base: RowHeightInput = {
      mode: 'translation', arabicSize: 28, listWidth: TRANSLATION_W,
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
        mode: 'mushaf', arabicSize, listWidth: MUSHAF_W,
        arabicChars: 500, translationChars: 0,
      });
    // b goes as size^2 (spike: b/size^2 constant within +-5% across 8 groups),
    // so doubling the size roughly quadruples the text term.
    const chrome = estimateRowHeight({
      mode: 'mushaf', arabicSize: 21, listWidth: MUSHAF_W,
      arabicChars: 0, translationChars: 0,
    });
    expect((at(42) - chrome) / (at(21) - chrome)).toBeCloseTo(4, 0);
  });

  it('ignores translation length in mushaf mode', () => {
    const base: RowHeightInput = {
      mode: 'mushaf', arabicSize: 28, listWidth: MUSHAF_W,
      arabicChars: 200, translationChars: 0,
    };
    expect(estimateRowHeight({ ...base, translationChars: 900 })).toBe(
      estimateRowHeight(base),
    );
  });

  it('shrinks the text term as the list gets wider', () => {
    const at = (listWidth: number) =>
      estimateRowHeight({
        mode: 'mushaf', arabicSize: 28, listWidth,
        arabicChars: 500, translationChars: 0,
      });
    expect(at(600)).toBeLessThan(at(334));
  });

  it('is finite and positive for degenerate input', () => {
    // listWidth is 0 on the first commit, before the list has laid out.
    const h = estimateRowHeight({
      mode: 'translation', arabicSize: 28, listWidth: 0,
      arabicChars: 1213, translationChars: 1334,
    });
    expect(Number.isFinite(h)).toBe(true);
    expect(h).toBeGreaterThan(0);
  });
});
