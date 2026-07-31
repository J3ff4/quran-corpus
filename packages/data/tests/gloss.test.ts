import { describe, it, expect } from 'vitest';
import { cleanGloss, cleanGlossList } from '../src/text/gloss.js';

describe('cleanGloss', () => {
  it('strips the verse quote marks the corpus carries into a gloss', () => {
    // Real corpus values: an ayah-opening speech mark rides along on the word.
    expect(cleanGloss('"Strike')).toBe('Strike');
    expect(cleanGloss('(in) gratitude."')).toBe('(in) gratitude');
    expect(cleanGloss('“what”')).toBe('what');
  });

  it('strips trailing sentence punctuation and the corpus connector dash', () => {
    expect(cleanGloss('He said,')).toBe('He said');
    expect(cleanGloss('the grateful ones.')).toBe('the grateful ones');
    expect(cleanGloss('your enemy -')).toBe('your enemy');
  });

  it('keeps an interior apostrophe -- it is part of the word', () => {
    expect(cleanGloss("one's person")).toBe("one's person");
    expect(cleanGloss("Allah's")).toBe("Allah's");
  });

  it('keeps parentheses -- they can be the meaning, not noise', () => {
    // Stripping the parens from "(the) Symbols" asserts a definite article the
    // Arabic need not carry.
    expect(cleanGloss('(the) Symbols')).toBe('(the) Symbols');
  });

  it('drops a leading conjunction -- it translates a wa-/fa- prefix, not the lemma', () => {
    expect(cleanGloss('And not')).toBe('not');
    expect(cleanGloss('and what')).toBe('what');
    expect(cleanGloss('And Allah sets forth')).toBe('Allah sets forth');
    expect(cleanGloss('So We cast')).toBe('We cast');
  });

  it('keeps a bare conjunction -- for a wa- lemma that IS the word', () => {
    expect(cleanGloss('and')).toBe('and');
    expect(cleanGloss('And')).toBe('And');
  });

  it('keeps a leading conjunction that is the lemma itself', () => {
    // The ownWord guard. For أم, which *means* "or", stripping the "or" off
    // "or what" does not remove an attached prefix -- it deletes the
    // translation and promotes the next word of the verse into its place.
    expect(cleanGloss('or what', 'or')).toBe('or what');
    expect(cleanGloss('Or Who', 'or')).toBe('Or Who');
    expect(cleanGloss('but I am', 'but')).toBe('but I am');
  });

  it('still strips a conjunction that is NOT the lemma itself', () => {
    // Same gloss, different owner: إمّا means "or", so a leading "and" is
    // still a wa- prefix and still goes.
    expect(cleanGloss('And if', 'or')).toBe('if');
    expect(cleanGloss('and what', 'but')).toBe('what');
  });

  it('does not strip a word that merely starts with those letters', () => {
    // Anchored on a following space, so "android" and "sorrow" are untouched.
    expect(cleanGloss('Andalusian')).toBe('Andalusian');
    expect(cleanGloss('sorrow')).toBe('sorrow');
    expect(cleanGloss('orphan')).toBe('orphan');
  });

  it('collapses inner whitespace', () => {
    expect(cleanGloss('consult   them   now')).toBe('consult them now');
  });

  it('returns empty when nothing printable survives', () => {
    expect(cleanGloss('  ",. ')).toBe('');
    expect(cleanGloss('')).toBe('');
  });
});

describe('cleanGlossList', () => {
  it('preserves the input (frequency) order', () => {
    expect(cleanGlossList(['what', 'And not', 'of what'], 5)).toEqual(['what', 'not', 'of what']);
  });

  it('collapses glosses that differed only by a wa-/fa- prefix', () => {
    // The ضرب regression: "Allah sets forth" (4x) and "And Allah sets forth"
    // (4x) are one meaning and were spending two of five chips saying it twice.
    expect(cleanGlossList(['Allah sets forth', 'And Allah sets forth', 'Strike'], 5)).toEqual([
      'Allah sets forth',
      'Strike',
    ]);
    expect(cleanGlossList(['what', 'and what'], 5)).toEqual(['what']);
  });

  it('de-duplicates case-insensitively, keeping the most frequent spelling', () => {
    // `Not` (90x) outranks `not` (78x) in the live corpus, so the capitalised
    // form arrives first and is the one kept.
    expect(cleanGlossList(['Not', 'not', 'NOT'], 5)).toEqual(['Not']);
  });

  it('de-duplicates variants that only differed by punctuation', () => {
    // This is the collapse that makes over-fetching necessary: three distinct
    // gloss_text rows, one chip.
    expect(cleanGlossList(['what', 'what,', '"what"'], 5)).toEqual(['what']);
  });

  it('drops glosses that clean to nothing', () => {
    expect(cleanGlossList(['said', ' ", ', 'told'], 5)).toEqual(['said', 'told']);
  });

  it('caps at the limit', () => {
    expect(cleanGlossList(['a', 'b', 'c', 'd', 'e', 'f'], 3)).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for a non-positive limit', () => {
    // The cap is an exact-equality break, so without a guard these would never
    // match and the function would return the whole list -- the opposite of
    // what a caller asking for "at most 0" meant.
    expect(cleanGlossList(['a', 'b'], 0)).toEqual([]);
    expect(cleanGlossList(['a', 'b'], -1)).toEqual([]);
    expect(cleanGlossList(['a', 'b'], NaN)).toEqual([]);
  });

  it('infers a conjunction lemma from its top gloss and stops stripping', () => {
    // The real أم rows, frequency-ordered. Without the guard these cleaned to
    // ['Or', 'Who', 'what', 'Who is'] -- three chips asserting that أم means
    // "who" and "what", which is the next word of the verse, not the lemma.
    expect(cleanGlossList(['Or', 'or', 'Or Who', 'or what', 'Who is'], 4)).toEqual([
      'Or',
      'Or Who',
      'or what',
      'Who is',
    ]);
  });

  it('leaves a non-conjunction lemma stripping as before', () => {
    // مَا: its top gloss is "what", so the guard never arms and "and what"
    // still collapses into "what". A POS-tag-based test would have broken
    // exactly this case -- مَا has SUB and SUP senses.
    expect(cleanGlossList(['what', 'and what', 'And not'], 3)).toEqual(['what', 'not']);
  });

  it('counts the limit AFTER de-duplication, not before', () => {
    // Otherwise a lemma whose top rows are punctuation variants of one gloss
    // would render a single chip while more distinct ones waited behind it.
    expect(cleanGlossList(['what', 'what,', 'what.', 'And not', 'of what'], 3)).toEqual([
      'what',
      'not',
      'of what',
    ]);
  });
});
