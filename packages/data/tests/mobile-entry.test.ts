import { describe, expect, it } from 'vitest';

describe('@quran-corpus/data/mobile', () => {
  it('exports mobile-safe query functions', async () => {
    const mod = await import('../src/mobile');

    expect(typeof mod.getAllSurahs).toBe('function');
    expect(typeof mod.getAyahsBySurah).toBe('function');
    expect(typeof mod.getWordsByAyah).toBe('function');
    expect(typeof mod.getWordDetail).toBe('function');
    expect(typeof mod.getTranslationsBySurahAndLang).toBe('function');
    expect(typeof mod.search).toBe('function');
  });

  it('does not export node/libsql runtime helpers', async () => {
    const mod = await import('../src/mobile');

    expect('createDatabase' in mod).toBe(false);
    expect('runMigrations' in mod).toBe(false);
    expect('backfillSearchIndex' in mod).toBe(false);
  });
});
