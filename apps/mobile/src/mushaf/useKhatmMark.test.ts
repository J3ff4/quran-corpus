import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  data: null as number | null,
  loading: false,
  reload: vi.fn(),
  getKhatmPage: vi.fn(),
  setKhatmPage: vi.fn(),
}));

// This hook's whole job is the optimistic mark/lift/override logic layered on
// top of useUserDbOnFocus; that read path (focus, resume, cancellation, the
// loading narrowing) has its own suite in useUserDbOnFocus.test.tsx. Stubbing
// it here, the way morphologyRoute.test.tsx stubs the same hook, means this
// suite covers only the decision this hook makes, not the read underneath it.
vi.mock('@/data/useUserDbOnFocus', () => ({
  useUserDbOnFocus: () => ({
    data: mocks.data,
    loading: mocks.loading,
    error: null,
    reload: mocks.reload,
  }),
}));

vi.mock('@/data/userRepository', () => ({
  getKhatmPage: mocks.getKhatmPage,
  setKhatmPage: mocks.setKhatmPage,
}));

vi.mock('@/data/userDb', () => ({
  openUserDb: async () => ({}),
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

import { useKhatmMark } from './useKhatmMark';

// A BLOCK body -- see useMushafPage.test.ts for why an arrow that returns the
// mock is the wrong shape here too.
beforeEach(() => {
  mocks.data = null;
  mocks.loading = false;
  mocks.reload.mockReset();
  mocks.getKhatmPage.mockReset();
  mocks.setKhatmPage.mockReset();
  mocks.setKhatmPage.mockResolvedValue(undefined);
});

describe('useKhatmMark', () => {
  it('reports no mark before anything is stored', () => {
    const { result } = renderHook(() => useKhatmMark('en'));
    expect(result.current.loading).toBe(false);
    expect(result.current.markedPage).toBeNull();
  });

  it('marks a page and reports it without a reload', async () => {
    // The ribbon has to appear on the tap, not on the next mount -- otherwise
    // the animation plays against a page that still looks unmarked. The
    // stubbed read never changes `data`, so this only passes if `markedPage`
    // is reading the optimistic override, not `stored.data`.
    const { result } = renderHook(() => useKhatmMark('en'));
    await act(() => result.current.mark(123, { surahId: 2, ayahNumber: 260 }));
    expect(result.current.markedPage).toBe(123);
    expect(mocks.setKhatmPage).toHaveBeenCalledWith(expect.anything(), {
      page: 123,
      surahId: 2,
      ayahNumber: 260,
    });
  });

  it('moves the mark rather than keeping both', async () => {
    const { result } = renderHook(() => useKhatmMark('en'));
    await act(() => result.current.mark(5, { surahId: 1, ayahNumber: 1 }));
    await act(() => result.current.mark(300, { surahId: 25, ayahNumber: 1 }));
    expect(result.current.markedPage).toBe(300);
  });

  it('lifts the mark', async () => {
    const { result } = renderHook(() => useKhatmMark('en'));
    await act(() => result.current.mark(5, { surahId: 1, ayahNumber: 1 }));
    await act(() => result.current.lift());
    expect(result.current.markedPage).toBeNull();
    // lift() is only reachable once a mark exists, so the reading_history row
    // already exists and setKhatmPage's ON CONFLICT upsert discards whatever
    // coordinates are sent -- real, valid, and inert is all that is required.
    expect(mocks.setKhatmPage).toHaveBeenLastCalledWith(expect.anything(), {
      page: null,
      surahId: 1,
      ayahNumber: 1,
    });
  });

  it('keeps the previous mark when a write rejects', async () => {
    // An optimistic update that does not roll back shows a ribbon the
    // database does not have, and it survives until the next mount.
    mocks.setKhatmPage.mockRejectedValueOnce(new Error('disk full'));
    const { result } = renderHook(() => useKhatmMark('en'));
    await act(() => result.current.mark(5, { surahId: 1, ayahNumber: 1 }).catch(() => {}));
    expect(result.current.markedPage).toBeNull();
  });

  it('restores the prior mark, not just null, when a write rejects', async () => {
    // A rollback that always resets to null -- rather than to whatever the
    // override was before this write -- would pass the test above (null ->
    // null) without actually restoring anything. This is the test that tells
    // the two apart.
    const { result } = renderHook(() => useKhatmMark('en'));
    await act(() => result.current.mark(5, { surahId: 1, ayahNumber: 1 }));
    mocks.setKhatmPage.mockRejectedValueOnce(new Error('disk full'));
    await act(() => result.current.mark(300, { surahId: 25, ayahNumber: 1 }).catch(() => {}));
    expect(result.current.markedPage).toBe(5);
  });

  it('re-throws the write failure so the caller can surface it', async () => {
    mocks.setKhatmPage.mockRejectedValueOnce(new Error('disk full'));
    const { result } = renderHook(() => useKhatmMark('en'));
    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mark(5, { surahId: 1, ayahNumber: 1 });
      } catch (cause) {
        caught = cause;
      }
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('disk full');
  });

  it('loading means nothing-to-show-yet, not no-mark', () => {
    // A ribbon that renders "unmarked" during the read flashes off and on at
    // every mount -- the same class as the bookmark delete jump.
    mocks.loading = true;
    const { result } = renderHook(() => useKhatmMark('en'));
    expect(result.current.loading).toBe(true);
  });
});
