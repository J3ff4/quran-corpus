import { describe, it, expect } from 'vitest';
import {
  surahNameKeys,
  surahNameExactMatch,
  surahNamePrefixMatch,
  surahTranslationKeys,
} from '../src/text/surahName.js';

/** How a match is actually decided in parseVerseRef: the query's keys against
 *  the stored name's keys, exact first. */
function matches(query: string, storedName: string): boolean {
  return surahNameExactMatch(surahNameKeys(query), surahNameKeys(storedName));
}

describe('surahNameKeys', () => {
  it('keeps the name with and without its definite article', () => {
    // Both, not just the stripped one: a reader types either.
    expect(surahNameKeys('Al-Baqara')).toContain('bakara');
    expect(surahNameKeys('Al-Baqara')).toContain('albakara');
  });

  it('undoes sun-letter assimilation', () => {
    // "Ar-Rahman" doubles the r; the article strip has to leave "rahman", not
    // "ahman", or the commonest surah name in the book stops resolving.
    expect(surahNameKeys('Ar-Rahman')).toContain('rahman');
  });

  it('reads Uzbek o as both a and u', () => {
    // Uzbek writes one letter for Arabic's long a and short u, so a single
    // mapping serves Rahmon and breaks Mo'minun. Both readings are emitted.
    expect(surahNameKeys('Rahmon')).toContain('rahman');
    expect(surahNameKeys("Mo'minun")).toContain('muminun');
  });

  it('keeps a short name whole rather than stripping its -h', () => {
    // "nuh" -> "nu" is not a romanization variant, it is a two-letter key that
    // whole-matches stray typing; and "allah" -> "alah" -> "ala" would answer
    // to Al-A'la, which is the single worst false jump this table can produce.
    expect(surahNameKeys('Nuh')).toEqual(['nuh']);
    expect(surahNameKeys('Ta-Ha')).toEqual(['taha']);
    expect(surahNameKeys('allah')).not.toContain('ala');
  });

  it('drops an article strip that leaves no name behind', () => {
    // "asr" starts with the article "as-" by accident; stripping it emits "r",
    // a one-letter key that prefixes a quarter of the book.
    expect(surahNameKeys('asr')).toEqual(['asr']);
  });

  it('never emits an empty key', () => {
    expect(surahNameKeys('---')).toEqual([]);
    expect(surahNameKeys('٢٥٥')).toEqual([]);
    for (const key of surahNameKeys('Al-Fatiha')) expect(key.length).toBeGreaterThan(0);
  });
});

describe('surah name matching', () => {
  it.each([
    ['baqara', 'Al-Baqara'],
    ['baqarah', 'Al-Baqara'],
    ['bakara', 'Al-Baqara'],
    ['najm', 'An-Najm'],
    ['ikhlas', 'Al-Ikhlas'],
    ['ihlos', 'Al-Ikhlas'],
    ['rahmon', 'Ar-Rahman'],
    ['fotiha', 'Al-Fatiha'],
    ['tavba', 'At-Tawba'],
    ['mominun', 'Al-Muminun'],
    ['falaq', 'Al-Falaq'],
    ['alaq', 'Al-Alaq'],
  ])('resolves %s to %s', (query, stored) => {
    expect(matches(query, stored)).toBe(true);
  });

  it('does not fold two different surahs together', () => {
    // The folding is lossy on purpose, so this is the check that it has not
    // been made so lossy that it starts answering with the wrong surah.
    expect(matches('An-Nas', 'An-Nasr')).toBe(false);
    expect(matches('Al-Falaq', 'Al-Fajr')).toBe(false);
    expect(matches('Al-Kahf', 'Al-Kawthar')).toBe(false);
  });

  it('prefix-matches only from three characters', () => {
    const stored = surahNameKeys('Al-Baqara');
    expect(surahNamePrefixMatch(surahNameKeys('baqar'), stored)).toBe(true);
    // "ba" prefixes several surahs; two letters is not an intent to jump.
    expect(surahNamePrefixMatch(surahNameKeys('ba'), stored)).toBe(false);
  });
});

describe('surahTranslationKeys', () => {
  it('forgives only case, punctuation and a leading "the"', () => {
    expect(surahTranslationKeys('The Cow')).toEqual(['thecow', 'cow']);
    expect(surahTranslationKeys('Mankind')).toEqual(['mankind']);
  });

  it('leaves English spelling alone', () => {
    // The transliteration fold exists for Arabic sounds and only does damage
    // here: through it "The Moon" and "The Man" share a key, and a reader
    // searching for Al-Qamar is sent confidently to Al-Insan.
    expect(surahTranslationKeys('The Moon')).toEqual(['themoon', 'moon']);
    expect(surahTranslationKeys('The Man')).toEqual(['theman', 'man']);
    const moon = surahTranslationKeys('The Moon');
    expect(surahTranslationKeys('The Man').some((k) => moon.includes(k))).toBe(false);
  });

  it('strips "the" only when a word is left behind', () => {
    // Same floor as the article strip: one or two letters left over is not a
    // name, it is a key that matches by accident.
    expect(surahTranslationKeys('The Ox')).toEqual(['theox']);
    expect(surahTranslationKeys('the')).toEqual(['the']);
  });
});

describe('a name or a query written in Cyrillic', () => {
  // The bug the owner hit on 2026-09-21: Search resolves a typed surah name
  // through these keys, both builders ended with `.replace(/[^a-z0-9]/g, '')`,
  // and a Cyrillic string folds to the empty string. `Бакара` found nothing,
  // and so did `бакара` -- in a UI where every surah name on screen was
  // Cyrillic. The 114 `uz-Cyrl` rows had been broken the same way all along.

  it('reduces a Cyrillic name to keys at all', () => {
    expect(surahNameKeys('Бакара')).not.toEqual([]);
    expect(surahNameKeys('Фатиха')).not.toEqual([]);
  });

  it('matches a Cyrillic query against a Cyrillic name', () => {
    expect(surahNameExactMatch(surahNameKeys('Бакара'), surahNameKeys('Бакара'))).toBe(true);
    expect(surahNameExactMatch(surahNameKeys('бакара'), surahNameKeys('Бакара'))).toBe(true);
  });

  it('matches a Cyrillic query against the stored Latin name, and back', () => {
    // The direction that actually failed in Search: the app resolves against
    // the corpus's own Latin transliteration whatever language is on screen.
    expect(surahNameExactMatch(surahNameKeys('Бакара'), surahNameKeys('Al-Baqara'))).toBe(true);
    expect(surahNameExactMatch(surahNameKeys('Baqara'), surahNameKeys('Бакара'))).toBe(true);
    expect(surahNameExactMatch(surahNameKeys('Фатиха'), surahNameKeys('Al-Fatiha'))).toBe(true);
    expect(surahNameExactMatch(surahNameKeys('Нур'), surahNameKeys('An-Nur'))).toBe(true);
  });

  it('carries the Uzbek Cyrillic letters through the same readings', () => {
    // `қ` -> `q` is what makes Бақара and Baqarah one name.
    expect(surahNameExactMatch(surahNameKeys('Бақара'), surahNameKeys('Baqarah'))).toBe(true);
    expect(surahNameExactMatch(surahNameKeys('Ихлос'), surahNameKeys('Al-Ikhlas'))).toBe(true);
  });

  it('strips a Cyrillic-written article like any other', () => {
    expect(surahNameExactMatch(surahNameKeys('Аль-Бакара'), surahNameKeys('Baqara'))).toBe(true);
  });

  it('matches a Russian meaning through the translation keys', () => {
    expect(surahTranslationKeys('Корова')).not.toEqual([]);
    expect(surahTranslationKeys('корова')).toEqual(surahTranslationKeys('Корова'));
  });

  it('does not let a Cyrillic name collapse onto an unrelated surah', () => {
    // The fold is lossy on purpose, but it still has to keep names apart.
    expect(surahNameExactMatch(surahNameKeys('Бакара'), surahNameKeys('An-Nur'))).toBe(false);
    expect(surahNameExactMatch(surahNameKeys('Нур'), surahNameKeys('Al-Baqara'))).toBe(false);
  });

  it('leaves a Latin name exactly as it was', () => {
    // Romanization runs only when there is Cyrillic to romanize, so every
    // existing key has to come out unchanged. Spelled out rather than compared
    // to another call of the same function -- that asserts nothing.
    expect(surahNameKeys('Al-Baqara')).toEqual(['albakara', 'bakara']);
    expect(surahNameKeys('Ar-Rahman')).toEqual(['arahman', 'rahman']);
    expect(surahNameKeys('Nuh')).toEqual(['nuh']);
    expect(surahTranslationKeys('The Cow')).toEqual(['thecow', 'cow']);
  });
});
