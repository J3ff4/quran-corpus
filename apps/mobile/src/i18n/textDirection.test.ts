import { describe, expect, it } from 'vitest';
import { isRtlText, textAlignFor } from './textDirection';

describe('isRtlText', () => {
  it('reads Arabic as RTL', () => {
    expect(isRtlText('سلام')).toBe(true);
  });

  it('reads Latin and Cyrillic as LTR', () => {
    expect(isRtlText('Muhim oyat')).toBe(false);
    expect(isRtlText('Тест')).toBe(false);
  });

  it('skips leading neutrals to reach the first strong character', () => {
    // The coordinate a reader is most likely to open a note with. Taking the
    // first character rather than the first *strong* one would call this LTR.
    expect(isRtlText('2:255 — سلام')).toBe(true);
    expect(isRtlText('"2:255" note')).toBe(false);
  });

  it('takes the FIRST strong character, not any of them', () => {
    // A note that opens in English and quotes Arabic is an English note.
    expect(isRtlText('see سلام here')).toBe(false);
    // ...and the mirror case, so a test that always answered "first script
    // present" would fail one of the pair.
    expect(isRtlText('سلام means peace')).toBe(true);
  });

  it('treats a string with no strong character as LTR', () => {
    expect(isRtlText('')).toBe(false);
    expect(isRtlText('123 — ...')).toBe(false);
  });

  it('recognises the other RTL scripts a note could be written in', () => {
    expect(isRtlText('שלום')).toBe(true);
  });
});

describe('textAlignFor', () => {
  it('aligns each direction to its own side', () => {
    expect(textAlignFor('سلام')).toBe('right');
    expect(textAlignFor('Muhim oyat')).toBe('left');
  });
});
