import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSurahList: vi.fn(),
  openCorpusDb: vi.fn(),
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));
vi.mock('./openCorpusDb', () => ({ openCorpusDb: () => mocks.openCorpusDb() }));
vi.mock('./corpusRepository', () => ({
  getSurahList: (...args: unknown[]) => mocks.getSurahList(...args),
}));

import { useSurahIndex } from './useSurahIndex';

function Probe({ surahId }: { surahId: number }) {
  const { ayahCountOf } = useSurahIndex();
  return <span data-testid="count">{String(ayahCountOf(surahId))}</span>;
}

beforeEach(() => {
  mocks.openCorpusDb.mockReset().mockResolvedValue({});
  mocks.getSurahList.mockReset().mockResolvedValue([
    { id: 1, ayahCount: 7 },
    { id: 2, ayahCount: 286 },
  ]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useSurahIndex', () => {
  it('hands back the rows themselves, once the read lands', async () => {
    function Rows() {
      const { surahs } = useSurahIndex();
      return <span data-testid="rows">{surahs === null ? 'null' : String(surahs.length)}</span>;
    }
    render(<Rows />);
    expect(screen.getByTestId('rows').textContent).toBe('null');
    await waitFor(() => expect(screen.getByTestId('rows').textContent).toBe('2'));
  });

  it('asks for the names in the language it was given', async () => {
    function Rows() {
      useSurahIndex('uz-Cyrl');
      return null;
    }
    render(<Rows />);
    await waitFor(() => expect(mocks.getSurahList).toHaveBeenCalled());
    expect(mocks.getSurahList.mock.calls[0]?.[1]).toBe('uz-Cyrl');
  });

  it('tries the read a second time before giving up on it', async () => {
    // A failed read used to leave the hook at null for the life of the screen,
    // and every caller hides the browse row while it is null -- one transient
    // failure removed a whole entry point for the session (#95).
    mocks.getSurahList
      .mockReset()
      .mockRejectedValueOnce(new Error('disk hiccup'))
      .mockResolvedValue([{ id: 1, ayahCount: 7 }]);

    function Rows() {
      const { surahs } = useSurahIndex();
      return <span data-testid="rows">{surahs === null ? 'null' : String(surahs.length)}</span>;
    }
    render(<Rows />);

    await waitFor(() => expect(screen.getByTestId('rows').textContent).toBe('1'));
    expect(mocks.getSurahList).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second attempt rather than retrying forever', async () => {
    mocks.getSurahList.mockReset().mockRejectedValue(new Error('corpus is gone'));

    function Rows() {
      const { surahs } = useSurahIndex();
      return <span data-testid="rows">{surahs === null ? 'null' : String(surahs.length)}</span>;
    }
    render(<Rows />);

    await waitFor(() => expect(mocks.getSurahList).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(mocks.getSurahList).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('rows').textContent).toBe('null');
  });

  it('drops the old language-s rows when a re-read fails', async () => {
    // The rows carry their names IN a language. Left standing through a failed
    // switch they show the previous script with nothing to say the switch did
    // not take -- "wrong", where null is only "not known yet".
    function Rows({ lang }: { lang: 'en' | 'uz-Cyrl' }) {
      const { surahs } = useSurahIndex(lang);
      return <span data-testid="rows">{surahs === null ? 'null' : String(surahs.length)}</span>;
    }
    const { rerender } = render(<Rows lang="en" />);
    await waitFor(() => expect(screen.getByTestId('rows').textContent).toBe('2'));

    mocks.getSurahList.mockRejectedValue(new Error('no such column: name_uz'));
    rerender(<Rows lang="uz-Cyrl" />);

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.getByTestId('rows').textContent).toBe('null');
  });
});

describe('useSurahIndex, projected to ayah counts', () => {
  it('answers null until the read lands, then the surah-s own count', async () => {
    render(<Probe surahId={2} />);
    expect(screen.getByTestId('count').textContent).toBe('null');
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('286'));
  });

  it('stays null for a surah the read did not cover', async () => {
    render(<Probe surahId={114} />);
    await waitFor(() => expect(mocks.getSurahList).toHaveBeenCalled());
    expect(screen.getByTestId('count').textContent).toBe('null');
  });

  it('stays null when the read fails, rather than throwing at the screen', async () => {
    mocks.openCorpusDb.mockRejectedValue(new Error('no such table: surahs'));
    render(<Probe surahId={1} />);
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.getByTestId('count').textContent).toBe('null');
  });
});
