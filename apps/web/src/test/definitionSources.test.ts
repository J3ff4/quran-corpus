import { describe, it, expect } from 'vitest';
import { definitionSourceLabel } from '../lib/definitionSources';

// The label is a licence obligation (§11): every definition rendered on the
// root and lemma pages carries the credit this returns, so both the mapped and
// the unmapped path have to be predictable.
describe('definitionSourceLabel', () => {
  it('maps both Lane tags to one name', () => {
    // Two tags, one lexicon: 'lane' is the original import, 'qurandev-lane' the
    // qurandev/roots one. A reader must not see them as different sources.
    expect(definitionSourceLabel('lane')).toBe("Lane's Lexicon");
    expect(definitionSourceLabel('qurandev-lane')).toBe("Lane's Lexicon");
  });

  it('names the corpus form glosses', () => {
    expect(definitionSourceLabel('corpus-forms')).toBe('Quranic Arabic Corpus');
  });

  it('returns null when there is no source at all', () => {
    expect(definitionSourceLabel(null)).toBeNull();
  });

  it('falls back to the raw tag for an unmapped source', () => {
    expect(definitionSourceLabel('not-a-source')).toBe('not-a-source');
  });

  it('credits perseus-lane as Lane, not as the raw tag', () => {
    expect(definitionSourceLabel('perseus-lane')).toBe("Lane's Lexicon");
  });

  it('does not resolve prototype keys to inherited members', () => {
    // Against an object literal these return Object.prototype's function --
    // truthy, so `??` never fires -- typed as `string`. React throws when
    // handed one as a child. `source` is a DB column, so these keys are
    // reachable input; the lookup is a Map for exactly this reason.
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      const label = definitionSourceLabel(key);
      expect(typeof label).toBe('string');
      expect(label).toBe(key);
    }
  });
});
