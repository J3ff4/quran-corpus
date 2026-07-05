import { describe, it, expect } from 'vitest';
import { parseSurahId, resolvePage, PAGE_SIZE } from '../app/surah/[id]/words/params';

describe('parseSurahId', () => {
  it('accepts 1..114', () => {
    expect(parseSurahId({ id: '1' })).toBe(1);
    expect(parseSurahId({ id: '114' })).toBe(114);
  });
  it('rejects non-digits and out-of-range', () => {
    expect(parseSurahId({ id: '0' })).toBeNull();
    expect(parseSurahId({ id: '115' })).toBeNull();
    expect(parseSurahId({ id: '1e2' })).toBeNull();
    expect(parseSurahId({ id: 'x' })).toBeNull();
  });
});

describe('resolvePage', () => {
  it('PAGE_SIZE is 15', () => expect(PAGE_SIZE).toBe(15));

  it('defaults to page 1 when no params', () => {
    const r = resolvePage(7, undefined, undefined);
    expect(r).toEqual({ page: 1, lo: 1, hi: 7, scrollAyah: null, totalPages: 1 });
  });

  it('clamps ?page to totalPages', () => {
    // 286 ayahs → ceil(286/15)=20 pages
    const r = resolvePage(286, '99', undefined);
    expect(r.page).toBe(20);
    expect(r.lo).toBe(286); // (20-1)*15+1
    expect(r.hi).toBe(286);
    expect(r.totalPages).toBe(20);
  });

  it('clamps bad ?page to 1', () => {
    expect(resolvePage(286, 'abc', undefined).page).toBe(1);
    expect(resolvePage(286, '0', undefined).page).toBe(1);
  });

  it('?ayah resolves to its page and sets scrollAyah', () => {
    const r = resolvePage(286, undefined, '255'); // ceil(255/15)=17
    expect(r.page).toBe(17);
    expect(r.scrollAyah).toBe(255);
    expect(r.lo).toBe(241); // (17-1)*15+1
    expect(r.hi).toBe(255); // min(17*15=255, 286)
  });

  it('?ayah beats ?page when both present', () => {
    const r = resolvePage(286, '1', '255');
    expect(r.page).toBe(17);
    expect(r.scrollAyah).toBe(255);
  });

  it('out-of-range ?ayah is ignored (no scroll, page 1)', () => {
    const r = resolvePage(7, undefined, '99');
    expect(r.page).toBe(1);
    expect(r.scrollAyah).toBeNull();
  });
});
