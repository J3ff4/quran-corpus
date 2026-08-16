import { describe, expect, it } from 'vitest';
import { posBucket } from '../src/morphology/buckets.js';

describe('posBucket', () => {
  it('groups the three nominal tags into one bucket', () => {
    // N, PN and ADJ share a colour on web today; splitting them here would
    // change the rendering of every noun in the corpus.
    expect(posBucket('N')).toBe('noun');
    expect(posBucket('PN')).toBe('noun');
    expect(posBucket('ADJ')).toBe('noun');
  });

  it('maps the four coloured tags', () => {
    expect(posBucket('V')).toBe('verb');
    expect(posBucket('P')).toBe('prep');
    expect(posBucket('PRON')).toBe('pron');
  });

  it('gives DET no bucket at all, not the other bucket', () => {
    // corpus.quran.com's wordbyword.jsp folds an assimilated determiner prefix
    // into its preposition's label rather than surfacing DET as its own
    // category. Bucketing it as `other` would paint a muted pill on a
    // determiner that the source treats as invisible -- the exact regression
    // apps/web/src/lib/posColor.ts's DET carve-out exists to prevent.
    expect(posBucket('DET')).toBeNull();
  });

  it('falls back to `other` for a tag it does not know', () => {
    expect(posBucket('NEG')).toBe('other');
    expect(posBucket('CONJ')).toBe('other');
    expect(posBucket('REM')).toBe('other');
    expect(posBucket('SOME_FUTURE_TAG')).toBe('other');
  });

  it('gives an absent tag no bucket', () => {
    expect(posBucket(null)).toBeNull();
    expect(posBucket(undefined)).toBeNull();
    expect(posBucket('')).toBeNull();
  });
});
