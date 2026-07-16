import { describe, it, expect } from 'vitest';
import { normalizeArabic, buildFtsMatch, stripQuranicAnnotations } from '../src/text/normalize.js';

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

describe('stripQuranicAnnotations', () => {
  it('removes the small-high rounded zero that mis-renders as a stray circle (80:31)', () => {
    expect(stripQuranicAnnotations('وَأَبًّا۟')).toBe('وَأَبًّا');
  });
  it('removes it mid-word without disturbing the letters around it (22:45 wabi-rin case)', () => {
    expect(stripQuranicAnnotations('يَسْجُدُوا۟لِلَّهِ')).toBe('يَسْجُدُوالِلَّهِ');
  });
  it('leaves ordinary harakat and letters untouched', () => {
    const uthmani = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
    expect(stripQuranicAnnotations(uthmani)).toBe(uthmani);
  });
});

describe('buildFtsMatch', () => {
  it('quotes a single term as a phrase', () => {
    expect(buildFtsMatch('throne')).toBe('"throne"');
  });
  it('ANDs multiple terms, each quoted (any order, any position)', () => {
    expect(buildFtsMatch('throne god')).toBe('"throne" AND "god"');
  });
  it('neutralizes FTS operators by quoting each term', () => {
    expect(buildFtsMatch('a* OR b')).toBe('"a*" AND "OR" AND "b"');
  });
  it('collapses runs of whitespace and ignores leading/trailing spaces', () => {
    expect(buildFtsMatch('  throne   god  ')).toBe('"throne" AND "god"');
  });
  it('escapes embedded double quotes per term', () => {
    expect(buildFtsMatch('say "hi"')).toBe('"say" AND """hi"""');
  });
});
