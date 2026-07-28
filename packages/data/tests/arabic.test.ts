import { describe, it, expect } from 'vitest';
import {
  buckwalterToArabic,
  compareRootsArabic,
  rootFirstLetter,
  foldRootArabic,
  foldRootArabicSql,
} from '../src/text/arabic.js';

describe('buckwalterToArabic', () => {
  it('maps consonant roots', () => {
    expect(buckwalterToArabic('H$r')).toBe('حشر'); // ح ش ر
    expect(buckwalterToArabic('dxl')).toBe('دخل'); // د خ ل
    expect(buckwalterToArabic('smw')).toBe('سمو');
  });
  it('maps single leaked letters', () => {
    expect(buckwalterToArabic('E')).toBe('ع');
    expect(buckwalterToArabic('*')).toBe('ذ');
    expect(buckwalterToArabic('$')).toBe('ش');
  });
  it('passes unknown chars through unchanged', () => {
    expect(buckwalterToArabic('ب?x')).toBe('ب?خ'); // '?' unmapped, stays
  });
});

describe('compareRootsArabic', () => {
  const sorted = (xs: string[]): string[] => [...xs].sort(compareRootsArabic);
  it('orders by hijāʾī, not ASCII/Buckwalter', () => {
    // sin(س) before kaf(ك) before sheen? no: correct order س ش ص ... ك
    expect(sorted(['ك ت ب', 'س م و'])).toEqual(['س م و', 'ك ت ب']);
  });
  it('sheen is NOT first (regression on Buckwalter $ sort)', () => {
    const out = sorted(['ش أ م', 'ا ب ب', 'ب و ب']);
    expect(out[0]).toBe('ا ب ب');
    expect(out[out.length - 1]).toBe('ش أ م');
  });
  it('hamza/alef variants fold; spaces ignored', () => {
    // 'أ م ر' folds alef-hamza -> alef, collates with 'ا م ر'
    expect(compareRootsArabic('أ م ر', 'امر')).toBe(0);
  });
  it('unknown letters sort last', () => {
    expect(compareRootsArabic('ب', 'Q')).toBeLessThan(0);
  });
});

describe('rootFirstLetter', () => {
  it('returns the first letter of a spaced root', () => {
    expect(rootFirstLetter('ب أ ر')).toBe('ب');
  });
  it('folds a hamza-seat first letter to bare alef', () => {
    expect(rootFirstLetter('أ ك ل')).toBe('ا');
  });
  it('folds alef-maqsura first letter to ya', () => {
    expect(rootFirstLetter('ى س ر')).toBe('ي');
  });
  it('tolerates leading space; empty -> ""', () => {
    expect(rootFirstLetter(' ب ')).toBe('ب');
    expect(rootFirstLetter('')).toBe('');
  });
});

describe('foldRootArabic', () => {
  it('strips every whitespace form', () => {
    expect(foldRootArabic('\u0643 \u062a\n\u0628')).toBe('\u0643\u062a\u0628'); // "ك ت ب" -> "كتب"
  });
  it('folds hamza seats to bare alef and maqsura to ya', () => {
    // "أرض" and "ارض" collapse to the same key
    expect(foldRootArabic('\u0623\u0631\u0636')).toBe(foldRootArabic('\u0627\u0631\u0636'));
    expect(foldRootArabic('\u0649\u0633\u0631')).toBe('\u064a\u0633\u0631');
  });
  it('leaves an already-normal root alone', () => {
    expect(foldRootArabic('\u0643\u062a\u0628')).toBe('\u0643\u062a\u0628');
  });
});

describe('foldRootArabicSql', () => {
  it('covers every fold pair foldRootArabic applies (no hand-written list)', () => {
    const sql = foldRootArabicSql('r.root_arabic');
    // Each seat the TS folder collapses must appear in the SQL chain too.
    for (const seat of ['\u0622', '\u0623', '\u0625', '\u0671', '\u0649']) {
      expect(foldRootArabic(seat)).not.toBe(seat); // guard: it really folds
      expect(sql).toContain(`'${seat}'`);
    }
    expect(sql).toContain('r.root_arabic');
  });
});
