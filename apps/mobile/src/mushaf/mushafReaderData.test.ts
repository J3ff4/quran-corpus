import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPageIndex, getSurahList, getAyahsOfSurah } = vi.hoisted(() => ({
  getPageIndex: vi.fn(),
  getSurahList: vi.fn(),
  getAyahsOfSurah: vi.fn(),
}));
vi.mock('@/data/corpusRepository', () => ({ getPageIndex, getSurahList, getAyahsOfSurah }));

import type { MobileDataClient } from '@quran-corpus/mobile-data';

import {
  resetMushafReaderCachesForTest,
  useMushafAyahs,
  useMushafIndex,
} from './mushafReaderData';

const client = {} as MobileDataClient;
const ayah = (surahId: number, ayahNumber: number) => ({
  id: 100 * surahId + ayahNumber,
  surah_id: surahId,
  ayah_number: ayahNumber,
  text_uthmani: `${surahId}:${ayahNumber}`,
  text_simple: null,
  juz: 1,
  page: 106,
  audio_url: null,
});

beforeEach(() => {
  resetMushafReaderCachesForTest();
  getPageIndex.mockReset().mockResolvedValue([
    { page: 106, startSurahId: 5, startAyahNumber: 82, surahName: 'Al-Maidah', juz: 6 },
  ]);
  getSurahList.mockReset().mockResolvedValue([{ id: 5, nameTranslit: 'Al-Maidah' }]);
  getAyahsOfSurah.mockReset().mockImplementation(async (_client: unknown, surahId: number) => [
    ayah(surahId, 1),
    ayah(surahId, 2),
  ]);
});

describe('useMushafIndex', () => {
  it('keys the pages by page number and the names by surah id', async () => {
    const { result } = renderHook(() => useMushafIndex(client));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.pages.get(106)?.startAyahNumber).toBe(82);
    expect(result.current.surahNames.get(5)).toBe('Al-Maidah');
  });

  it('asks nothing of a database that is not open yet', () => {
    const { result } = renderHook(() => useMushafIndex(null));

    expect(result.current.ready).toBe(false);
    expect(getPageIndex).not.toHaveBeenCalled();
  });

  it('reads the index once however many readers ask for it', async () => {
    // Two layers mount together for the length of a mode switch, and the
    // reader remounts on every surah page-turn. 604 rows per mount would be a
    // query on the UI's critical path for data that cannot change.
    const first = renderHook(() => useMushafIndex(client));
    const second = renderHook(() => useMushafIndex(client));

    await waitFor(() => expect(first.result.current.ready).toBe(true));
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(getPageIndex).toHaveBeenCalledTimes(1);
  });

  it('lets the next mount retry after a failed read', async () => {
    // A cached rejection would leave every page in the session without a juz
    // and every header without a name.
    getPageIndex.mockRejectedValueOnce(new Error('database closed'));
    const failed = renderHook(() => useMushafIndex(client));
    await waitFor(() => expect(getPageIndex).toHaveBeenCalledTimes(1));
    expect(failed.result.current.ready).toBe(false);

    const retried = renderHook(() => useMushafIndex(client));
    await waitFor(() => expect(retried.result.current.ready).toBe(true));
  });
});

describe('useMushafAyahs', () => {
  it('keys every ayah of the surahs on screen by surah and ayah', async () => {
    const { result } = renderHook(() => useMushafAyahs(client, [5, 6]));

    await waitFor(() => expect(result.current.size).toBe(4));
    expect(result.current.get('5:1')?.text_uthmani).toBe('5:1');
    expect(result.current.get('6:2')?.id).toBe(602);
  });

  it('fetches a surah once however many of its pages are visited', async () => {
    // Across MOUNTS, not renders: the reader mounts a second layer for every
    // mode switch and a fresh tree for every surah chevron, and al-Baqarah is
    // 286 rows over the bridge each time.
    const first = renderHook(() => useMushafAyahs(client, [5]));
    await waitFor(() => expect(first.result.current.size).toBe(2));

    const second = renderHook(() => useMushafAyahs(client, [5]));
    await waitFor(() => expect(second.result.current.size).toBe(2));

    expect(getAyahsOfSurah).toHaveBeenCalledTimes(1);
  });

  it('re-runs only when the surahs on screen actually change', async () => {
    // The caller rebuilds the window array on every render; keying the effect
    // on the array itself would issue a query per render.
    const { result, rerender } = renderHook(({ ids }) => useMushafAyahs(client, ids), {
      initialProps: { ids: [5] },
    });
    await waitFor(() => expect(result.current.size).toBe(2));

    rerender({ ids: [5] });
    rerender({ ids: [5, 5] });

    expect(getAyahsOfSurah).toHaveBeenCalledTimes(1);
  });

  it('leaves the map empty rather than throwing when a surah cannot be read', async () => {
    getAyahsOfSurah.mockRejectedValueOnce(new Error('database closed'));
    const { result } = renderHook(() => useMushafAyahs(client, [5]));

    await waitFor(() => expect(getAyahsOfSurah).toHaveBeenCalledTimes(1));
    expect(result.current.size).toBe(0);
  });
});
