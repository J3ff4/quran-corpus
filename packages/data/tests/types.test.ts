import { describe, it, expectTypeOf } from 'vitest';
import type { Surah, Ayah, Word, Language, Translation, WordGloss } from '../src/types.js';

describe('types', () => {
  it('Surah has correct shape', () => {
    expectTypeOf<Surah>().toHaveProperty('id').toBeNumber();
    expectTypeOf<Surah>().toHaveProperty('revelation_type').toEqualTypeOf<'meccan' | 'medinan'>();
    expectTypeOf<Surah>().toHaveProperty('ayah_count').toBeNumber();
  });

  it('Ayah nullable fields are typed correctly', () => {
    expectTypeOf<Ayah>().toHaveProperty('text_simple').toEqualTypeOf<string | null>();
    expectTypeOf<Ayah>().toHaveProperty('audio_url').toEqualTypeOf<string | null>();
  });

  it('Language direction is constrained', () => {
    expectTypeOf<Language>().toHaveProperty('direction').toEqualTypeOf<'ltr' | 'rtl'>();
  });

  it('Word nullable fields are typed correctly', () => {
    expectTypeOf<Word>().toHaveProperty('root').toEqualTypeOf<string | null>();
    expectTypeOf<Word>().toHaveProperty('morphology_json').toEqualTypeOf<string | null>();
  });
});
