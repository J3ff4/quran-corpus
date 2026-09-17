import { describe, it, expect } from 'vitest';
import { makeT } from '../t';

const t = makeT({
  en: { greet: 'Peace' },
  uz: { greet: 'Salom' },
  ru: { greet: 'Мир' },
});

describe('makeT', () => {
  it('returns the string for the asked locale', () => {
    expect(t('uz', 'greet')).toBe('Salom');
    expect(t('ru', 'greet')).toBe('Мир');
  });

  it('is keyed by the table, so a missing key is a type error not a runtime one', () => {
    // @ts-expect-error 'missing' is not a key of the table
    t('en', 'missing');
  });
});
