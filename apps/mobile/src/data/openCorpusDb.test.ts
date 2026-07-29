import { describe, expect, it } from 'vitest';
import { corpusDbAssetName, corpusDbFileName } from './openCorpusDb';

describe('openCorpusDb constants', () => {
  it('uses the bundled M1 DB asset name and stable local filename', () => {
    expect(corpusDbAssetName).toBe('quran.db');
    expect(corpusDbFileName).toBe('quran-corpus.db');
  });
});
