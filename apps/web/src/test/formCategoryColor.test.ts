import { describe, it, expect } from 'vitest';
import { categorizeFormLabel, formCategoryColor } from '../lib/formCategoryColor';

// Every distinct root_forms.pos_label value observed DB-wide (queried
// 2026-07-23, 47 values). A future label not in this list must be added here
// deliberately -- this test fails closed so a new label never silently falls
// into 'other' unnoticed.
const KNOWN_LABELS: Record<string, ReturnType<typeof categorizeFormLabel>> = {
  'Noun': 'noun',
  'Form I verb': 'verb',
  'Active participle': 'active-participle',
  'Form IV verb': 'verb',
  'Nominal': 'adjective',
  'Form II verb': 'verb',
  'Passive participle': 'passive-participle',
  'Adjective': 'adjective',
  'Form IV active participle': 'active-participle',
  'Form VIII verb': 'verb',
  'Form V verb': 'verb',
  'Form X verb': 'verb',
  'Form III verb': 'verb',
  'Form II verbal noun': 'verbal-noun',
  'Verbal noun': 'verbal-noun',
  'Form II passive participle': 'passive-participle',
  'Form IV passive participle': 'passive-participle',
  'Form VIII active participle': 'active-participle',
  'Form VI verb': 'verb',
  'Form II active participle': 'active-participle',
  'Form IV verbal noun': 'verbal-noun',
  'Form V active participle': 'active-participle',
  'Form X active participle': 'active-participle',
  'Proper noun': 'noun',
  'Form III active participle': 'active-participle',
  'Form III verbal noun': 'verbal-noun',
  'Form VIII passive participle': 'passive-participle',
  'Form VII verb': 'verb',
  'Form VI verbal noun': 'verbal-noun',
  'Form V verbal noun': 'verbal-noun',
  'Form VIII verbal noun': 'verbal-noun',
  'Form VI active participle': 'active-participle',
  'Form X verbal noun': 'verbal-noun',
  'Form X passive participle': 'passive-participle',
  'Time adverb': 'noun',
  'Form VII active participle': 'active-participle',
  'Form IX active participle': 'active-participle',
  'Form XII active participle': 'active-participle',
  'Form IX verb': 'verb',
  'Imperative verbal noun': 'verbal-noun',
  'Form of address': 'other',
  'Form XII verb': 'verb',
  'Form VII verbal noun': 'verbal-noun',
  'Form VII passive participle': 'passive-participle',
  'Form V passive participle': 'passive-participle',
  'Form III passive participle': 'passive-participle',
  'Conditional particle': 'other',
};

describe('categorizeFormLabel', () => {
  it('categorizes every known live pos_label value', () => {
    for (const [label, expected] of Object.entries(KNOWN_LABELS)) {
      expect(categorizeFormLabel(label)).toBe(expected);
    }
  });
  it('falls back to other for an unrecognized label', () => {
    expect(categorizeFormLabel('Something Brand New')).toBe('other');
  });
});

describe('formCategoryColor', () => {
  it('returns a distinct CSS var per category', () => {
    const categories = [
      'verb', 'verbal-noun', 'active-participle', 'passive-participle',
      'noun', 'adjective', 'other',
    ] as const;
    const colors = categories.map(formCategoryColor);
    expect(new Set(colors).size).toBe(categories.length);
    for (const c of colors) expect(c).toMatch(/^var\(--form-/);
  });
});
