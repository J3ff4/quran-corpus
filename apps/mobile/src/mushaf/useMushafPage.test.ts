import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMushafPage } = vi.hoisted(() => ({ getMushafPage: vi.fn() }));
vi.mock('@quran-corpus/data/mobile', () => ({ getMushafPage }));

import type { MobileDataClient } from '@quran-corpus/mobile-data';

import { useMushafPage } from './useMushafPage';

const client = {} as MobileDataClient;
const lineOf = (line: number) => ({ line, words: [] });

// A BLOCK body, not `beforeEach(() => getMushafPage.mockReset())`. An arrow
// that returns the mock hands vitest the mock as the hook's result, and the
// rejection this suite deliberately provokes then surfaces as the test's own
// failure rather than as the state the hook reports -- with the assertion
// passing on the line above it.
beforeEach(() => {
  getMushafPage.mockReset();
});

describe('useMushafPage', () => {
  it('loads the page-s lines', async () => {
    getMushafPage.mockResolvedValue([lineOf(1)]);
    const { result } = renderHook(() => useMushafPage(client, 106));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lines).toEqual([lineOf(1)]);
    expect(getMushafPage).toHaveBeenCalledWith(client, 106);
  });

  it('stays loading while there is no database yet', () => {
    // Not `loading: false` with no lines: the pager would draw that as an
    // empty page rather than as a page still arriving.
    const { result } = renderHook(() => useMushafPage(null, 106));
    expect(result.current.loading).toBe(true);
    expect(getMushafPage).not.toHaveBeenCalled();
  });

  it('surfaces a failed query instead of showing a blank page', async () => {
    // An async throw, not mockRejectedValue: the latter builds the rejected
    // promise at call time, before the hook attaches its catch.
    getMushafPage.mockImplementation(async () => {
      throw new RangeError('mushaf page must be an integer');
    });
    const { result } = renderHook(() => useMushafPage(client, 605));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(RangeError));
    expect(result.current.loading).toBe(false);
  });

  it('ignores a slow query for a page the reader has already left', async () => {
    // The pager swipes faster than SQLite answers. Without the cancelled flag
    // the abandoned page-s rows land on top of the one now on screen.
    let resolveFirst: (lines: unknown) => void = () => {};
    getMushafPage
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce([lineOf(2)]);

    const { result, rerender } = renderHook(({ page }) => useMushafPage(client, page), {
      initialProps: { page: 106 },
    });
    rerender({ page: 107 });
    await waitFor(() => expect(result.current.lines).toEqual([lineOf(2)]));

    resolveFirst([lineOf(1)]);
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.lines).toEqual([lineOf(2)]);
  });

  it('names the page its lines belong to, and none while they are in flight', async () => {
    // The mushaf screen starts a page-s first ayah off these rows, so it has
    // to be able to tell rows for the page in front of the reader from the
    // ones still on screen for the page they just left. `lines.length` cannot:
    // the old page-s rows are non-empty.
    getMushafPage.mockResolvedValueOnce([lineOf(1)]).mockImplementationOnce(() => new Promise(() => {}));
    const { result, rerender } = renderHook(({ page }) => useMushafPage(client, page), {
      initialProps: { page: 106 },
    });
    await waitFor(() => expect(result.current.page).toBe(106));

    rerender({ page: 107 });

    expect(result.current.page).toBeNull();
  });
});
