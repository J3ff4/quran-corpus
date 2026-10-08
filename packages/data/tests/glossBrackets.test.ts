import { describe, expect, it } from 'vitest';
import { splitGlossBrackets, type GlossRun } from '../src/text/glossBrackets.js';

const join = (runs: GlossRun[]) => runs.map((r) => r.text).join('');

describe('splitGlossBrackets', () => {
  it.each([
    ['слово', [{ text: 'слово', dim: false }]],
    ['(Только) Тебе', [{ text: '(Только)', dim: true }, { text: ' Тебе', dim: false }]],
    ['они [знайте]!', [{ text: 'они ', dim: false }, { text: '[знайте]', dim: true }, { text: '!', dim: false }]],
    ['(всё в скобках)', [{ text: '(всё в скобках)', dim: true }]],
    ['«имя [досл. – много (благ)]»', [
      { text: '«имя ', dim: false }, { text: '[досл. – много (благ)]', dim: true }, { text: '»', dim: false }]],
    ['the (one) who (is)', [
      { text: 'the ', dim: false }, { text: '(one)', dim: true }, { text: ' who ', dim: false }, { text: '(is)', dim: true }]],
  ])('%s', (gloss, runs) => expect(splitGlossBrackets(gloss)).toEqual(runs));

  it('leaves an unclosed opener plain, never dims the rest', () => {
    expect(splitGlossBrackets('a (b c')).toEqual([{ text: 'a (b c', dim: false }]);
  });

  it('leaves a stray closer plain', () => {
    expect(splitGlossBrackets('a) b')).toEqual([{ text: 'a) b', dim: false }]);
  });

  it('keeps dimming after a stray closer', () => {
    expect(splitGlossBrackets('a) (b)')).toEqual([
      { text: 'a) ', dim: false },
      { text: '(b)', dim: true },
    ]);
  });

  it('returns nothing for an empty gloss', () => expect(splitGlossBrackets('')).toEqual([]));

  it('always re-joins to its input', () => {
    for (const g of ['a (b) c', '((x))', 'a (b', ')(', '[a(b]c)', 'x [y] (z)']) {
      expect(join(splitGlossBrackets(g))).toBe(g);
    }
  });
});
