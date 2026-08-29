import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
// Route tests live here, not beside the route. expo-router's require.context
// pulls EVERY .ts/.tsx under app/ into the bundle as a route, so a colocated
// test ships vitest and react-dom to the device and registers itself as a
// screen. Verified: `expo export --platform android` fails outright.
import WordDetailRoute from '../../../app/word/[surah]/[ayah]/[position]';

const mocks = vi.hoisted(() => ({
  params: { surah: '2', ayah: '255', position: '1' } as Record<string, string>,
  getWordAtLocation: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mocks.params,
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => ({}),
}));

vi.mock('@/data/corpusRepository', () => ({
  getWordAtLocation: (...args: unknown[]) => mocks.getWordAtLocation(...args),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ contentLanguage: 'en', uiLocale: 'en' }),
}));

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    ScrollView: host('div'),
    Text: host('span'),
    View: host('div'),
  };
});

function segment(id: number, formArabic: string, posTag: string): WordSegment {
  return {
    id,
    word_id: 1,
    segment_index: id,
    form_arabic: formArabic,
    form_buckwalter: null,
    segment_type: null,
    pos_tag: posTag,
    features_json: null,
    lemma: null,
    root: null,
  };
}

const word: Word = {
  id: 1,
  ayah_id: 262,
  position: 1,
  text_arabic: 'ٱللَّهُ',
  transliteration: 'l-lahu',
  root: 'اله',
  lemma: 'ٱللَّه',
  root_buckwalter: 'Alh',
  lemma_buckwalter: 'All~ah',
  pos_tag: 'PN',
  morphology_json: null,
  morphology_description: null,
  // The corpus's own mangled column. If it ever reaches the screen the test
  // below catches it by name.
  grammar_arabic: 'ââ¬â¹ mangled',
  grammar_note: 'nominative masculine noun',
  audio_url: null,
};

const summary = {
  word,
  segments: [segment(1, 'ٱل', 'DET'), segment(2, 'لَّهُ', 'PN')],
  gloss: { text: 'Allah', lang: 'en', isFallback: false },
};

describe('word detail route', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.params = { surah: '2', ayah: '255', position: '1' };
    mocks.getWordAtLocation.mockReset();
    mocks.getWordAtLocation.mockResolvedValue(summary);
  });

  it.each([
    ['abc', 'not a number'],
    ['0', 'below the first surah'],
    ['-1', 'negative'],
    ['1e9', 'integer-valued but out of range'],
    ['2.5', 'fractional'],
    ['', 'empty'],
  ])('rejects surah %s (%s) before querying', async (bad) => {
    // Route params are strings off a deep link, not trusted input. Each of
    // these must resolve to the not-found state without reaching the query
    // layer at all.
    mocks.params = { surah: bad, ayah: '255', position: '1' };

    render(<WordDetailRoute />);

    expect(await screen.findByText('That word is not in the corpus')).toBeTruthy();
    expect(mocks.getWordAtLocation).not.toHaveBeenCalled();
  });

  it('rejects a surah above 114, an ayah above 286 and a position above 128', async () => {
    // One case per bound: a shared upper limit would let two of the three
    // pass on the wrong number.
    for (const params of [
      { surah: '115', ayah: '1', position: '1' },
      { surah: '2', ayah: '287', position: '1' },
      { surah: '2', ayah: '255', position: '129' },
    ]) {
      mocks.params = params;
      render(<WordDetailRoute />);
      expect(await screen.findByText('That word is not in the corpus')).toBeTruthy();
      cleanup();
    }

    expect(mocks.getWordAtLocation).not.toHaveBeenCalled();
  });

  it('queries the coordinates it was given', async () => {
    render(<WordDetailRoute />);
    await screen.findByText('Allah');

    // Positionally: transposing surah and ayah here would still render a word,
    // just the wrong one.
    expect(mocks.getWordAtLocation).toHaveBeenCalledWith({}, 2, 255, 1, 'en');
  });

  it('renders one pill per segment in order', async () => {
    const { container } = render(<WordDetailRoute />);

    const pills = await screen.findAllByTestId('segment-pill');
    expect(pills).toHaveLength(2);
    expect(container.textContent).toContain('ٱل');
  });

  it('shows the not-found state for coordinates the corpus does not carry', async () => {
    mocks.params = { surah: '2', ayah: '255', position: '99' };
    mocks.getWordAtLocation.mockResolvedValue(null);

    render(<WordDetailRoute />);

    expect(await screen.findByText('That word is not in the corpus')).toBeTruthy();
  });

  it('shows the not-found state when the query throws', async () => {
    mocks.getWordAtLocation.mockRejectedValue(new Error('no such table: words'));

    render(<WordDetailRoute />);

    expect(await screen.findByText('That word is not in the corpus')).toBeTruthy();
  });

  it('shows the grammar note, not the garbled grammar_arabic column', async () => {
    // grammar_arabic is the corpus's own mangled field; grammar_note is the
    // clean one. Both PR #44 and PR #45 shipped the wrong column on web.
    const { container } = render(<WordDetailRoute />);

    expect(await screen.findByText('nominative masculine noun')).toBeTruthy();
    expect(container.textContent).not.toContain('mangled');
  });

  it('marks a gloss that fell back to another language', async () => {
    // The third surface that prints a gloss. Sheet and grid have their own
    // guards; without one here the full-analysis screen was the one place the
    // mark could be dropped and every suite stay green.
    mocks.getWordAtLocation.mockResolvedValue({
      ...summary,
      gloss: { text: 'Allah', lang: 'en', isFallback: true },
    });

    render(<WordDetailRoute />);

    expect((await screen.findByTestId('gloss-lang-en')).textContent).toBe('(en)');
  });

  it('leaves a gloss in the requested language unmarked', async () => {
    render(<WordDetailRoute />);

    await screen.findByText('Allah');
    expect(screen.queryByTestId('gloss-lang-en')).toBeNull();
  });

  it('falls back to the no-gloss line when the word has no translation', async () => {
    mocks.getWordAtLocation.mockResolvedValue({ ...summary, gloss: null });

    render(<WordDetailRoute />);

    expect(await screen.findByText('No translation for this word')).toBeTruthy();
  });

  it('announces the transliteration as one', async () => {
    render(<WordDetailRoute />);

    expect(await screen.findByLabelText('Transliteration: l-lahu')).toBeTruthy();
  });
});
