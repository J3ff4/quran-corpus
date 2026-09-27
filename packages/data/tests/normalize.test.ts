import { describe, it, expect } from 'vitest';
import {
  normalizeArabic,
  buildFtsMatch,
  stripQuranicAnnotations,
  transliterateUzbekLatinToCyrillic,
  highlightTerms,
  wordMatchesHighlight,
} from '../src/text/normalize.js';

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
  it('makes a term a prefix query, so "star" reaches "stars"', () => {
    expect(buildFtsMatch('star')).toBe('"star"*');
  });
  it('ANDs multiple terms, each its own prefix query', () => {
    expect(buildFtsMatch('throne god')).toBe('"throne"* AND "god"*');
  });
  it('leaves a term below the length floor exact, not a prefix', () => {
    // A two-letter prefix query matches a large fraction of the corpus, and
    // two-letter words are mostly particles and stopwords -- nothing real is
    // lost by keeping them exact.
    expect(buildFtsMatch('of')).toBe('"of"');
    expect(buildFtsMatch('a')).toBe('"a"');
  });
  it('neutralizes FTS operators by quoting each term', () => {
    expect(buildFtsMatch('a* OR b')).toBe('"a*" AND "OR" AND "b"');
  });
  it('keeps a long operator-bearing term quoted, wildcard outside the quotes', () => {
    // The trailing * is deliberate syntax; the one inside the phrase must stay
    // literal text, or a user's own '*' becomes a second prefix operator.
    expect(buildFtsMatch('abc*')).toBe('"abc*"*');
  });
  it('collapses runs of whitespace and ignores leading/trailing spaces', () => {
    expect(buildFtsMatch('  throne   god  ')).toBe('"throne"* AND "god"*');
  });
  it('escapes embedded double quotes per term', () => {
    expect(buildFtsMatch('say "hi"')).toBe('"say"* AND """hi"""*');
  });

  describe('Arabic proclitic expansion', () => {
    it('expands an Arabic term over the article and conjunctions', () => {
      const m = buildFtsMatch('ارض');
      // The bare form, the article form (275 of the live corpus's 444 hits),
      // and a conjunction+article form.
      expect(m).toContain('"ارض"*');
      expect(m).toContain('"الارض"*');
      expect(m).toContain('"والارض"*');
    });
    it('parenthesizes each term\'s arms so OR cannot bind across the ANDs', () => {
      const m = buildFtsMatch('ارض سماء');
      expect(m).toMatch(/^\(.*\) AND \(.*\)$/);
    });
    it('does not expand a Latin term over Arabic proclitics', () => {
      expect(buildFtsMatch('earth')).toBe('"earth"*');
    });
    it('leaves a short Arabic term exact, unexpanded', () => {
      expect(buildFtsMatch('في')).toBe('"في"');
    });
  });
});

describe('transliterateUzbekLatinToCyrillic', () => {
  it('maps plain letters', () => {
    expect(transliterateUzbekLatinToCyrillic('Alloh')).toBe('аллоҳ');
  });
  it('maps the sh digraph', () => {
    expect(transliterateUzbekLatinToCyrillic('bilish')).toBe('билиш');
  });
  it('maps oʻ/gʻ across the common apostrophe glyphs', () => {
    expect(transliterateUzbekLatinToCyrillic("o'zbek")).toBe('ўзбек');
    expect(transliterateUzbekLatinToCyrillic('oʻzbek')).toBe('ўзбек');
    expect(transliterateUzbekLatinToCyrillic("gʻalaba")).toBe('ғалаба');
  });
  it('maps ch/yo/yu/ya digraphs', () => {
    expect(transliterateUzbekLatinToCyrillic('kitobcha')).toBe('китобча');
    expect(transliterateUzbekLatinToCyrillic('yomon')).toBe('ёмон');
    expect(transliterateUzbekLatinToCyrillic('yurak')).toBe('юрак');
    expect(transliterateUzbekLatinToCyrillic('yaxshi')).toBe('яхши');
  });
});

describe('highlightTerms', () => {
  it('offers every proclitic arm the FTS match uses', () => {
    const terms = highlightTerms('ارض').map((t) => t.term);

    // The highlighter and buildFtsMatch have to agree arm for arm, or a row
    // the index matched on `والارض` comes back with nothing marked.
    expect(terms).toContain('ارض');
    expect(terms).toContain('الارض');
    expect(terms).toContain('والارض');
  });

  it('keeps a short term exact, as the index does', () => {
    expect(highlightTerms('ال')).toEqual([{ term: 'ال', exact: true }]);
    expect(highlightTerms('star')).toEqual([{ term: 'star', exact: false }]);
  });
});

describe('wordMatchesHighlight', () => {
  it('matches through the harakat the query never carries', () => {
    expect(wordMatchesHighlight('ٱلرَّحْمَٰنِ', highlightTerms('الرحمن'))).toBe(true);
  });

  it('matches a prefix, which is what makes stars a hit for star', () => {
    expect(wordMatchesHighlight('stars', highlightTerms('star'))).toBe(true);
  });

  it('folds case, which the FTS tokenizer does on Latin and Cyrillic rows', () => {
    // The index matched `Name` on the query `name`; a case-sensitive
    // highlighter would leave the very word the search found unmarked.
    expect(wordMatchesHighlight('Name', highlightTerms('name'))).toBe(true);
    expect(wordMatchesHighlight('name', highlightTerms('Name'))).toBe(true);
  });

  it('does NOT prefix-match below the length floor', () => {
    // FTS5 gets a bare phrase for a two-character term, so it never matched
    // `الرحمن` on `ال` -- marking it would highlight a word the search did not
    // find, and `ال` prefixes a large share of every Arabic line.
    expect(wordMatchesHighlight('ٱلرَّحْمَٰنِ', highlightTerms('ال'))).toBe(false);
    expect(wordMatchesHighlight('ال', highlightTerms('ال'))).toBe(true);
  });
});
