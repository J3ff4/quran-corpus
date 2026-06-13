import { describe, it, expectTypeOf } from 'vitest';
import type { Surah, Ayah, Word, Language, Translation, WordGloss } from '../src/types.js';

describe('types', () => {
  it('Surah has correct shape', () => {
    expectTypeOf<Surah>().toHaveProperty('id').toBeNumber();
    expectTypeOf<Surah>().toHaveProperty('name_arabic').toBeString();
    expectTypeOf<Surah>().toHaveProperty('name_translit').toBeString();
    expectTypeOf<Surah>().toHaveProperty('name_translation').toBeString();
    expectTypeOf<Surah>().toHaveProperty('revelation_type').toEqualTypeOf<'meccan' | 'medinan'>();
    expectTypeOf<Surah>().toHaveProperty('ayah_count').toBeNumber();
    expectTypeOf<Surah>().toHaveProperty('order_number').toBeNumber();
  });

  it('Ayah nullable fields are typed correctly', () => {
    expectTypeOf<Ayah>().toHaveProperty('id').toBeNumber();
    expectTypeOf<Ayah>().toHaveProperty('surah_id').toBeNumber();
    expectTypeOf<Ayah>().toHaveProperty('ayah_number').toBeNumber();
    expectTypeOf<Ayah>().toHaveProperty('text_uthmani').toBeString();
    expectTypeOf<Ayah>().toHaveProperty('text_simple').toEqualTypeOf<string | null>();
    expectTypeOf<Ayah>().toHaveProperty('juz').toEqualTypeOf<number | null>();
    expectTypeOf<Ayah>().toHaveProperty('page').toEqualTypeOf<number | null>();
    expectTypeOf<Ayah>().toHaveProperty('audio_url').toEqualTypeOf<string | null>();
  });

  it('Word nullable fields are typed correctly', () => {
    expectTypeOf<Word>().toHaveProperty('id').toBeNumber();
    expectTypeOf<Word>().toHaveProperty('ayah_id').toBeNumber();
    expectTypeOf<Word>().toHaveProperty('position').toBeNumber();
    expectTypeOf<Word>().toHaveProperty('text_arabic').toBeString();
    expectTypeOf<Word>().toHaveProperty('transliteration').toEqualTypeOf<string | null>();
    expectTypeOf<Word>().toHaveProperty('root').toEqualTypeOf<string | null>();
    expectTypeOf<Word>().toHaveProperty('lemma').toEqualTypeOf<string | null>();
    expectTypeOf<Word>().toHaveProperty('pos_tag').toEqualTypeOf<string | null>();
    expectTypeOf<Word>().toHaveProperty('morphology_json').toEqualTypeOf<string | null>();
  });

  it('Language direction is constrained', () => {
    expectTypeOf<Language>().toHaveProperty('code').toBeString();
    expectTypeOf<Language>().toHaveProperty('name_native').toBeString();
    expectTypeOf<Language>().toHaveProperty('name_english').toBeString();
    expectTypeOf<Language>().toHaveProperty('direction').toEqualTypeOf<'ltr' | 'rtl'>();
  });

  it('Translation has correct shape', () => {
    expectTypeOf<Translation>().toHaveProperty('id').toBeNumber();
    expectTypeOf<Translation>().toHaveProperty('ayah_id').toBeNumber();
    expectTypeOf<Translation>().toHaveProperty('language_code').toBeString();
    expectTypeOf<Translation>().toHaveProperty('translator').toBeString();
    expectTypeOf<Translation>().toHaveProperty('text').toBeString();
  });

  it('WordGloss has correct shape', () => {
    expectTypeOf<WordGloss>().toHaveProperty('id').toBeNumber();
    expectTypeOf<WordGloss>().toHaveProperty('word_id').toBeNumber();
    expectTypeOf<WordGloss>().toHaveProperty('language_code').toBeString();
    expectTypeOf<WordGloss>().toHaveProperty('gloss_text').toBeString();
  });
});
