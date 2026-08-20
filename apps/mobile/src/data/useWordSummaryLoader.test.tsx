import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileDataClient } from '@quran-corpus/mobile-data';
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
            .then((summary) => setGloss(summary.gloss ?? 'none'))
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
        new Map([[2001, `gloss-${language}`]]),
    );
    mocks.getWordSummary.mockImplementation(
      async (_client: unknown, w: Word, gloss: string | null) => ({ word: w, segments: [], gloss }),
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

  it('rejects rather than querying before the database is open', async () => {
    render(<Probe surahId={null} contentLanguage="en" />);
    tap();

    await waitFor(() => expect(screen.getByTestId('gloss').textContent).toMatch(/^error:/));
    expect(mocks.getSurahGlosses).not.toHaveBeenCalled();
  });
});
