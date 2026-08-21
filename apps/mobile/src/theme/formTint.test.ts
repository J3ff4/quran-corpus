import { describe, expect, it } from 'vitest';
import { formTint, formColorFor } from './formTint';
import { themeColors } from './tokens';

describe('formTint', () => {
  it('appends the calibrated 16% alpha, and only that', () => {
    // 0x29 = 41 = 16% of 255, rounded. The palette's second contrast figure is
    // measured at exactly this mix, so changing it invalidates the table in
    // packages/config/theme/palette.ts.
    expect(formTint('#ab392c')).toBe('#ab392c29');
  });

  it('leaves a colour that already carries alpha alone', () => {
    expect(formTint('#ab392c29')).toBe('#ab392c29');
  });
});

describe('formColorFor', () => {
  it('picks the colour by category, not by label text', () => {
    // Two different labels, one category, one colour.
    const a = formColorFor(themeColors.light, 'Form IV verb');
    const b = formColorFor(themeColors.light, 'Form I verb');
    expect(a.color).toBe(b.color);
    expect(a.color).toBe(themeColors.light.form.verb);
  });

  it('reads an adverb as a noun', () => {
    expect(formColorFor(themeColors.light, 'Time adverb').color).toBe(
      themeColors.light.form.noun,
    );
  });

  it('covers every category in both themes', () => {
    for (const theme of [themeColors.light, themeColors.dark]) {
      for (const key of ['verb', 'verbal-noun', 'active-participle',
        'passive-participle', 'noun', 'adjective', 'other'] as const) {
        expect(theme.form[key]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});
