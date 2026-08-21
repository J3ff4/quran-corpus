import { describe, expect, it } from 'vitest';
import { parseLemmaParam, parseRootParam } from './routeParams';

describe('parseLemmaParam / parseRootParam', () => {
  it('accepts the decoded identifier expo-router hands a route', () => {
    // The single most frequent lemma in the corpus (ٱللَّه, 2699 occurrences).
    // The link site encodes `{` to `%7B`; expo-router decodes it back before
    // useLocalSearchParams returns, so this is the value a route actually sees.
    expect(parseLemmaParam('{ll~ah')).toBe('{ll~ah');
    expect(parseRootParam('$Am')).toBe('$Am');
  });

  it('refuses a still-encoded segment rather than decoding it again', () => {
    // expo-router already decoded once. Decoding here too would resolve
    // `qa%2541la` to `qaAla` -- a real lemma under a segment web 404s.
    expect(parseLemmaParam('%7Bll~ah')).toBeNull();
    expect(parseRootParam('qa%2541la')).toBeNull();
  });

  it('rejects an array param instead of joining it', () => {
    // `['qAl','mA']` stringifies to `qAl,mA`, and `,` is in the Buckwalter
    // charset -- so a validator taking a bare string would pass it to SQLite.
    expect(parseLemmaParam(['qAl', 'mA'])).toBe('qAl');
    expect(parseLemmaParam(undefined)).toBeNull();
  });

  it('applies the shared length cap', () => {
    expect(parseRootParam('r'.repeat(25))).toBeNull();
  });
});
