import { describe, it, expect } from 'vitest';
import { normalizeArabic, escapeFtsQuery } from '../src/text/normalize.js';

describe('normalizeArabic', () => {
  it('strips harakat and folds alef-wasla to bare alef (Al-Fatiha 1:1)', () => {
    const uthmani = '﻿بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
    expect(normalizeArabic(uthmani)).toBe('بسم الله الرحمن الرحيم');
  });
  it('makes a bare query match its diacritized source', () => {
    expect(normalizeArabic('كَتَبَ')).toBe(normalizeArabic('كتب'));
  });
  it('folds hamzated alef forms', () => {
    expect(normalizeArabic('أإآا')).toBe('اااا');
  });
  it('leaves Latin/Cyrillic untouched', () => {
    expect(normalizeArabic('Throne')).toBe('Throne');
    expect(normalizeArabic('Милостивый')).toBe('Милостивый');
  });
});

describe('escapeFtsQuery', () => {
  it('quotes the term as a phrase', () => {
    expect(escapeFtsQuery('throne')).toBe('"throne"');
  });
  it('neutralizes FTS operators by quoting', () => {
    expect(escapeFtsQuery('a* OR b')).toBe('"a* OR b"');
  });
  it('escapes embedded double quotes', () => {
    expect(escapeFtsQuery('say "hi"')).toBe('"say ""hi"""');
  });
});
