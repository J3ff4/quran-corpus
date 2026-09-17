import { describe, it, expect } from 'vitest';
import { nameFor } from '../components/surah-list/nameFor';

const fatihah = { id: 1, name_translit: 'Al-Fatihah', name_translation: 'The Opening' };

describe('nameFor', () => {
  it('uses the localized name when the map covers the surah', () => {
    const names = new Map([[1, { name: 'Fotiha', meaning: 'Ochuvchi' }]]);
    expect(nameFor(names, fatihah)).toEqual({ name: 'Fotiha', meaning: 'Ochuvchi' });
  });

  it('falls back to the surahs row when the map does not, so English is unchanged', () => {
    // getSurahNames already covers all 114; this guards a partial map and is
    // what keeps a locale with no name set reading exactly as it did before.
    expect(nameFor(new Map(), fatihah)).toEqual({
      name: 'Al-Fatihah',
      meaning: 'The Opening',
    });
  });

  it('keeps a deliberate NULL meaning null rather than re-filling it', () => {
    // getSurahNames NULLs a meaning that would only echo the name (Tavba /
    // Tavba); refilling it from name_translation would put the echo back.
    const names = new Map([[1, { name: 'Tavba', meaning: null }]]);
    expect(nameFor(names, { id: 1, name_translit: 'At-Tawbah', name_translation: 'Tavba' }))
      .toEqual({ name: 'Tavba', meaning: null });
  });
});
