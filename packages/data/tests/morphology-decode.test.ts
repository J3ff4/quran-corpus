import { describe, it, expect } from 'vitest';
import { decodeSegment } from '../src/morphology/decode.js';
import type { WordSegment } from '../src/types.js';

function seg(over: Partial<WordSegment>): WordSegment {
  return {
    id: 1,
    word_id: 1,
    segment_index: 0,
    segment_type: 'stem',
    pos_tag: 'N',
    form_arabic: null,
    form_buckwalter: null,
    features_json: null,
    lemma: null,
    root: null,
    ...over,
  };
}

describe('decodeSegment', () => {
  it('decodes role + POS label (en + ar)', () => {
    const d = decodeSegment(seg({ segment_type: 'prefix', pos_tag: 'P' }));
    expect(d.role).toBe('prefix');
    expect(d.pos).toEqual({ code: 'P', en: 'Preposition', ar: 'حرف جر' });
  });

  it('null segment_type defaults role to stem', () => {
    expect(decodeSegment(seg({ segment_type: null })).role).toBe('stem');
  });

  it('maps case + gender to labeled features', () => {
    const d = decodeSegment(
      seg({ features_json: '{"case":"genitive","gender":"masculine"}' }),
    );
    expect(d.features).toContainEqual({ key: 'case', label: 'Case', value: 'Genitive' });
    expect(d.features).toContainEqual({ key: 'gender', label: 'Gender', value: 'Masculine' });
  });

  it('maps raw tags to unlabeled features', () => {
    const d = decodeSegment(
      seg({ pos_tag: 'V', features_json: '{"raw":["PERF","3MS","(IV)"]}' }),
    );
    const vals = d.features.map((f) => f.value);
    expect(vals).toContain('Perfect');
    expect(vals).toContain('3rd person masculine singular');
    expect(vals).toContain('Form IV');
    expect(d.unknownTags).toEqual([]);
  });

  it('pushes unknown raw tags to unknownTags, never features', () => {
    const d = decodeSegment(seg({ features_json: '{"raw":["ZZZ"]}' }));
    expect(d.unknownTags).toEqual(['ZZZ']);
    expect(d.features.some((f) => f.value === 'ZZZ')).toBe(false);
  });

  it('unknown POS code falls back to raw code as en', () => {
    const d = decodeSegment(seg({ pos_tag: 'ZZ' }));
    expect(d.pos).toEqual({ code: 'ZZ', en: 'ZZ' });
  });

  it('null POS tag surfaces "?" rather than a blank chip', () => {
    const d = decodeSegment(seg({ pos_tag: null }));
    expect(d.pos).toEqual({ code: '', en: '?' });
  });

  it('malformed features_json yields no features, no throw', () => {
    const d = decodeSegment(seg({ features_json: '{bad json' }));
    expect(d.features).toEqual([]);
    expect(d.unknownTags).toEqual([]);
  });

  it('null features_json yields no features', () => {
    expect(decodeSegment(seg({ features_json: null })).features).toEqual([]);
  });

  it('converts Buckwalter root to Arabic; passes lemma through', () => {
    const d = decodeSegment(seg({ root: 'smw', lemma: 'ٱسْم' }));
    expect(d.rootArabic).toBe('سمو');
    expect(d.lemma).toBe('ٱسْم');
  });

  it('omits rootArabic/lemma when absent', () => {
    const d = decodeSegment(seg({ root: null, lemma: null }));
    expect(d.rootArabic).toBeUndefined();
    expect(d.lemma).toBeUndefined();
  });
});
