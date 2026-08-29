import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileDataClient } from '@quran-corpus/mobile-data';
import type { Gloss } from './corpusRepository';
import type { Word } from '@quran-corpus/data/mobile';
import type { ContentLanguageCode } from '@/i18n/languages';
import { useWordSummaryLoader } from './useWordSummaryLoader';

const mocks = vi.hoisted(() => ({
  getSurahGlosses: vi.fn(),
  getWordSummary: vi.fn(),
}));

vi.mock('./corpusRepository', () => ({
  getSurahGlosses: (...args: unknown[]) => mocks.getSurahGlosses(...args),
  getWordSummary: (...args: unknown[]) => mocks.getWordSummary(...args),
}));

const client = {} as MobileDataClient;
const word = { id: 2001 } as Word;

/** Taps `word` on click and prints the gloss it resolved. Driven by a click
 *  rather than an effect so a test can tap twice without remounting, which is
 *  the only arrangement that can see the cache. */
function Probe({
  surahId,
  contentLanguage,
}: {
  surahId: number | null;
  contentLanguage: ContentLanguageCode;
}) {
  const load = useWordSummaryLoader(client, surahId, contentLanguage);
  const [gloss, setGloss] = React.useState<string>('');
  return (
    <>
      <button
        data-testid="tap"
        onClick={() => {
          load(word)
            .then((summary) => setGloss(summary.gloss?.text ?? 'none'))
            .catch((cause: Error) => setGloss(`error: ${cause.message}`));
        }}
      />
      <span data-testid="gloss">{gloss}</span>
    </>
  );
}

function tap() {
  fireEvent.click(screen.getByTestId('tap'));
}

describe('useWordSummaryLoader', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.getSurahGlosses.mockReset();
    mocks.getWordSummary.mockReset();
    mocks.getSurahGlosses.mockImplementation(
      async (_client: unknown, _surahId: number, language: string) =>
        new Map([[2001, { text: `gloss-${language}`, lang: language, isFallback: false }]]),
    );
    mocks.getWordSummary.mockImplementation(
      async (_client: unknown, w: Word, gloss: Gloss | null) => ({ word: w, segments: [], gloss }),
    );
  });

  it('passes the word its own gloss from the surah map', async () => {
    render(<Probe surahId={2} contentLanguage="en" />);
    tap();

    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toBe('gloss-en'));
  });

  it('fetches the surah glosses once across taps', async () => {
    render(<Probe surahId={2} contentLanguage="en" />);
    tap();
    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toBe('gloss-en'));

    // Same surah, same language: the second tap must reuse the cache. Without
    // it every tap re-reads al-Baqarah's 6,116 gloss rows.
    tap();
    await waitFor(() => expect(mocks.getWordSummary).toHaveBeenCalledTimes(2));

    expect(mocks.getSurahGlosses).toHaveBeenCalledTimes(1);
  });

  it('refetches when the content language changes', async () => {
    const { rerender } = render(<Probe surahId={2} contentLanguage="en" />);
    tap();
    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toBe('gloss-en'));

    // A surah-only cache key serves the English glosses to a reader who has
    // just switched to Russian, and the sheet looks perfectly normal.
    rerender(<Probe surahId={2} contentLanguage="ru" />);
    tap();

    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toBe('gloss-ru'));
  });

  it('issues one query for taps that overlap', async () => {
    // The defect: the cache was written only after the await, so a second tap
    // landing while the first query was in flight also missed and issued its
    // own full-surah query. Two taps a moment apart read al-Baqarah's 6,116
    // gloss rows twice.
    let release!: (glosses: Map<number, Gloss>) => void;
    mocks.getSurahGlosses.mockImplementation(
      () => new Promise<Map<number, Gloss>>((resolve) => (release = resolve)),
    );

    render(<Probe surahId={2} contentLanguage="en" />);
    tap();
    tap();

    expect(mocks.getSurahGlosses).toHaveBeenCalledTimes(1);
    release(new Map([[2001, { text: 'gloss-en', lang: 'en', isFallback: false }]]));
    await waitFor(() => expect(mocks.getWordSummary).toHaveBeenCalledTimes(2));
  });

  it('keeps the newer language when an older query is still in flight', async () => {
    // Both queries are running at once and the English one finishes last. The
    // reader has already switched to Russian, so the cache must still be the
    // Russian map once the dust settles.
    const pending = new Map<string, (glosses: Map<number, Gloss>) => void>();
    mocks.getSurahGlosses.mockImplementation(
      (_client: unknown, _surahId: number, language: string) =>
        new Promise<Map<number, Gloss>>((resolve) => pending.set(language, resolve)),
    );

    const { rerender } = render(<Probe surahId={2} contentLanguage="en" />);
    tap();
    rerender(<Probe surahId={2} contentLanguage="ru" />);
    tap();

    pending.get('ru')!(new Map([[2001, { text: 'gloss-ru', lang: 'ru', isFallback: false }]]));
    pending.get('en')!(new Map([[2001, { text: 'gloss-en', lang: 'en', isFallback: false }]]));
    await waitFor(() => expect(mocks.getWordSummary).toHaveBeenCalledTimes(2));

    // A third tap, after both have landed, is the one that shows which map the
    // cache kept -- and it must not re-query, or the assertion proves nothing.
    mocks.getSurahGlosses.mockClear();
    tap();
    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toBe('gloss-ru'));
    expect(mocks.getSurahGlosses).not.toHaveBeenCalled();
  });

  it('answers an in-flight tap after a newer query has failed and cleared the cache', async () => {
    // The two live at once: the English query is still running when the
    // Russian one fails and empties the cache. A call that reads the ref back
    // after its await finds null and throws a TypeError at the reader; each
    // call has to resolve against the entry it started with.
    const pending = new Map<string, (glosses: Map<number, Gloss>) => void>();
    const failing = new Map<string, (cause: Error) => void>();
    mocks.getSurahGlosses.mockImplementation(
      (_client: unknown, _surahId: number, language: string) =>
        new Promise<Map<number, Gloss>>((resolve, reject) => {
          pending.set(language, resolve);
          failing.set(language, reject);
        }),
    );

    const { rerender } = render(<Probe surahId={2} contentLanguage="en" />);
    tap();
    rerender(<Probe surahId={2} contentLanguage="ru" />);
    tap();

    failing.get('ru')!(new Error('no such table'));
    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toMatch(/^error:/));

    pending.get('en')!(new Map([[2001, { text: 'gloss-en', lang: 'en', isFallback: false }]]));
    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toBe('gloss-en'));
  });

  it('retries after a failed query instead of caching the failure', async () => {
    // Caching the promise caches its rejection too: without clearing it, one
    // failed query leaves every later tap on that surah replaying the same
    // error for the life of the screen.
    mocks.getSurahGlosses.mockRejectedValueOnce(new Error('no such table'));

    render(<Probe surahId={2} contentLanguage="en" />);
    tap();
    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toBe('error: no such table'));

    tap();
    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toBe('gloss-en'));
  });

  it('rejects rather than querying before the database is open', async () => {
    render(<Probe surahId={null} contentLanguage="en" />);
    tap();

    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toMatch(/^error:/));
    expect(mocks.getSurahGlosses).not.toHaveBeenCalled();
  });
});
