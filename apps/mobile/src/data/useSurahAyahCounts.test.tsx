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

import { useSurahAyahCounts } from './useSurahAyahCounts';

function Probe({ surahId }: { surahId: number }) {
  const ayahCountOf = useSurahAyahCounts();
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

describe('useSurahAyahCounts', () => {
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
