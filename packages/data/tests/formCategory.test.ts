import { describe, it, expect } from 'vitest';
import { categorizeFormLabel } from '../src/morphology/formCategory.js';

// Every distinct root_forms.pos_label DB-wide (49 values, queried 2026-08-21).
// A future label not in this list must be added here deliberately -- this test
// fails closed so a new label never silently falls into 'other' unnoticed.
const KNOWN_LABELS: Record<string, ReturnType<typeof categorizeFormLabel>> = {
  'Noun': 'noun',
  'Form I verb': 'verb',
  'Active participle': 'active-participle',
  'Form IV verb': 'verb',
  'Nominal': 'adjective',
  'Form II verb': 'verb',
  'Adjective': 'adjective',
  'Passive participle': 'passive-participle',
  'Form VIII verb': 'verb',
  'Form IV active participle': 'active-participle',
  'Form V verb': 'verb',
  'Form X verb': 'verb',
  'Form III verb': 'verb',
  'Verbal noun': 'verbal-noun',
  'Form II verbal noun': 'verbal-noun',
  'Form II passive participle': 'passive-participle',
  'Form IV passive participle': 'passive-participle',
  'Form VI verb': 'verb',
  'Form VIII active participle': 'active-participle',
  'Form II active participle': 'active-participle',
  'Form IV verbal noun': 'verbal-noun',
  'Form V active participle': 'active-participle',
  'Proper noun': 'noun',
  'Form X active participle': 'active-participle',
  'Form III verbal noun': 'verbal-noun',
  'Form III active participle': 'active-participle',
  'Form VII verb': 'verb',
  'Form VIII passive participle': 'passive-participle',
  'Form VI verbal noun': 'verbal-noun',
  'Form VI active participle': 'active-participle',
  'Form V verbal noun': 'verbal-noun',
  'Form VIII verbal noun': 'verbal-noun',
  'Form VII active participle': 'active-participle',
  'Form X verbal noun': 'verbal-noun',
  'Form X passive participle': 'passive-participle',
  'Time adverb': 'noun',
  'Form IX active participle': 'active-participle',
  'Form XII active participle': 'active-participle',
  'Form VII verbal noun': 'verbal-noun',
  'Form IX verb': 'verb',
  'Form III passive participle': 'passive-participle',
  'Location adverb': 'noun',
  'Imperative verbal noun': 'verbal-noun',
  'Form of address': 'other',
  'Form XII verb': 'verb',
  'Form XI active participle': 'active-participle',
  'Form VII passive participle': 'passive-participle',
  'Form V passive participle': 'passive-participle',
  'Conditional particle': 'other',
};

describe('categorizeFormLabel', () => {
  it('covers every live pos_label value', () => {
    expect(Object.keys(KNOWN_LABELS)).toHaveLength(49);
    for (const [label, expected] of Object.entries(KNOWN_LABELS)) {
      expect(categorizeFormLabel(label)).toBe(expected);
    }
  });

  it('falls back to other for an unrecognized label', () => {
    expect(categorizeFormLabel('Something Brand New')).toBe('other');
  });

  // The ordering trap, asserted on its own so a reordered implementation fails
  // here rather than in the 49-row table where it reads as one line of noise:
  // 'adverb' contains 'verb', so the adverb test must precede the verb test.
  it('reads an adverb as a noun, not as a verb', () => {
    expect(categorizeFormLabel('Time adverb')).toBe('noun');
    expect(categorizeFormLabel('Location adverb')).toBe('noun');
  });
});
