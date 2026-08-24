import { describe, it, expect } from 'vitest';
import { formCategoryColor, type FormCategory } from '../lib/formCategoryColor';

describe('formCategoryColor', () => {
  it('returns a distinct CSS var per category', () => {
    const categories: FormCategory[] = [
      'verb', 'verbal-noun', 'active-participle', 'passive-participle',
      'noun', 'adjective', 'other',
    ];
    const colors = categories.map(formCategoryColor);
    expect(new Set(colors).size).toBe(categories.length);
    for (const c of colors) expect(c).toMatch(/^var\(--form-/);
  });
});
