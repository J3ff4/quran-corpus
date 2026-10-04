import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deferred } from '../testing/deferred';

const mocks = vi.hoisted(() => ({
  data: null as number | null,
  loading: false,
  reload: vi.fn(),
  error: null as string | null,
  getKhatmPage: vi.fn(),
  setKhatmPage: vi.fn(),
  clearKhatmPage: vi.fn(),
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
    error: mocks.error,
    reload: mocks.reload,
  }),
}));

vi.mock('@/data/userRepository', () => ({
  getKhatmPage: mocks.getKhatmPage,
  setKhatmPage: mocks.setKhatmPage,
  clearKhatmPage: mocks.clearKhatmPage,
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
  mocks.error = null;
  mocks.reload.mockReset();
  mocks.getKhatmPage.mockReset();
  mocks.setKhatmPage.mockReset();
  mocks.setKhatmPage.mockResolvedValue(undefined);
  mocks.clearKhatmPage.mockReset();
  mocks.clearKhatmPage.mockResolvedValue(undefined);
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
    // Through clearKhatmPage, which takes no coordinates. setKhatmPage's
    // insert branch would need some, and the only ones a lift can offer are
    // invented -- which is how an earlier draft stored a reading position of
    // 1:1 for a reader who had never opened surah 1.
    expect(mocks.clearKhatmPage).toHaveBeenCalledTimes(1);
    expect(mocks.setKhatmPage).toHaveBeenCalledTimes(1);
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

  it('does not let a late failure undo a newer write that already landed', async () => {
    // Two taps, resolving out of order: the first write is still open when the
    // second one succeeds, and then the first one fails. Rolling back to
    // "whatever the override was before this write" would restore the state
    // from before BOTH taps -- painting "no mark" over a page the database has
    // just marked. The rollback target is the last CONFIRMED value, so it is
    // right in every ordering.
    const stalled = deferred<void>();
    mocks.setKhatmPage.mockReturnValueOnce(stalled.promise);
    const { result } = renderHook(() => useKhatmMark('en'));

    let first!: Promise<void>;
    act(() => {
      first = result.current.mark(5, { surahId: 1, ayahNumber: 1 }).catch(() => {});
    });
    await act(() => result.current.mark(300, { surahId: 25, ayahNumber: 1 }));
    expect(result.current.markedPage).toBe(300);

    await act(async () => {
      stalled.reject(new Error('database is locked'));
      await first;
    });
    expect(result.current.markedPage).toBe(300);
  });

  it('does not drop the newer mark when an older write fails first', async () => {
    // The other ordering: both writes still in flight, and the OLDER one
    // fails. Only the newest write may roll back -- an older one restoring its
    // own stale value flashes the ribbon off while the write that will set it
    // is still on its way. Same generation guard useUserDbOnFocus uses on its
    // reads.
    const older = deferred<void>();
    const newer = deferred<void>();
    mocks.setKhatmPage.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const { result } = renderHook(() => useKhatmMark('en'));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.mark(5, { surahId: 1, ayahNumber: 1 }).catch(() => {});
    });
    act(() => {
      second = result.current.mark(300, { surahId: 25, ayahNumber: 1 });
    });
    expect(result.current.markedPage).toBe(300);

    await act(async () => {
      older.reject(new Error('database is locked'));
      await first;
    });
    expect(result.current.markedPage).toBe(300);

    await act(async () => {
      newer.resolve();
      await second;
    });
    expect(result.current.markedPage).toBe(300);
  });

  it('rolls back to the stored value, not to an unconfirmed in-flight mark', async () => {
    // Two taps in flight, the NEWER one fails. Rolling back to "whatever the
    // override was when this write started" restores the older tap's page --
    // which no write has confirmed, and which is left on screen for good once
    // that older write fails too and the generation guard stops it rolling
    // back. The rollback target is the last value actually written, so with
    // nothing confirmed it falls through to `stored.data`.
    const older = deferred<void>();
    const newer = deferred<void>();
    mocks.setKhatmPage.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const { result } = renderHook(() => useKhatmMark('en'));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.mark(5, { surahId: 1, ayahNumber: 1 }).catch(() => {});
    });
    act(() => {
      second = result.current.mark(300, { surahId: 25, ayahNumber: 1 }).catch(() => {});
    });

    await act(async () => {
      newer.reject(new Error('database is locked'));
      await second;
    });
    expect(result.current.markedPage).toBeNull();

    await act(async () => {
      older.reject(new Error('database is locked'));
      await first;
    });
    expect(result.current.markedPage).toBeNull();
  });

  it('keeps mark and lift stable across renders', async () => {
    // These go to a button in the mushaf chrome, above a PagerView that
    // re-renders all 604 of its children whenever a prop changes identity.
    // The stubbed useUserDbOnFocus above returns a fresh object every render,
    // exactly as the real one does, so a handler that depends on it directly
    // is a new function every time.
    const { result, rerender } = renderHook(() => useKhatmMark('en'));
    const { mark, lift } = result.current;
    await act(() => result.current.mark(5, { surahId: 1, ayahNumber: 1 }));
    rerender();
    expect(result.current.mark).toBe(mark);
    expect(result.current.lift).toBe(lift);
  });

  it('does not go back to loading while the re-read after a write is in flight', async () => {
    // reload() is called on a successful write and is not awaited, so
    // useUserDbOnFocus reports loading again until the re-read lands. The
    // override already holds the value, so there is nothing to wait for -- and
    // a consumer that renders `loading` as a spinner-or-nothing would blink the
    // ribbon out during exactly the drop animation the override protects.
    const { result, rerender } = renderHook(() => useKhatmMark('en'));
    await act(() => result.current.mark(123, { surahId: 2, ayahNumber: 260 }));
    mocks.loading = true;
    rerender();
    expect(result.current.markedPage).toBe(123);
    expect(result.current.loading).toBe(false);
  });

  it('surfaces a read failure instead of reporting no mark', async () => {
    // "unreadable" and "unmarked" look the same from markedPage, and they are
    // not the same: offering the mark button over a failed read invites the
    // reader to overwrite a khatm the database still holds. The hook cannot
    // tell them apart for the caller, so it has to pass the error out.
    mocks.error = 'Unable to load the khatm mark';
    const { result } = renderHook(() => useKhatmMark('en'));
    expect(result.current.markedPage).toBeNull();
    expect(result.current.error).toBe('Unable to load the khatm mark');
  });

  it('does not let an older write that lands last become the rollback target', async () => {
    // A(5) is still open when B(300) succeeds, and then A succeeds too. Only
    // one of the two is what the database now holds: expo-sqlite serialises
    // per connection, so the statements ran in call order and B is last. An
    // unguarded success path records A's page as "confirmed" simply because it
    // resolved last, and the NEXT failure then rolls the ribbon back to 5 --
    // a page B has already replaced.
    const older = deferred<void>();
    mocks.setKhatmPage.mockReturnValueOnce(older.promise);
    const { result } = renderHook(() => useKhatmMark('en'));

    let first!: Promise<void>;
    act(() => {
      first = result.current.mark(5, { surahId: 1, ayahNumber: 1 });
    });
    await act(() => result.current.mark(300, { surahId: 25, ayahNumber: 1 }));
    await act(async () => {
      older.resolve();
      await first;
    });
    expect(result.current.markedPage).toBe(300);

    mocks.setKhatmPage.mockRejectedValueOnce(new Error('disk full'));
    await act(() => result.current.mark(7, { surahId: 2, ayahNumber: 1 }).catch(() => {}));
    expect(result.current.markedPage).toBe(300);
  });

  it('loading means nothing-to-show-yet, not no-mark', () => {
    // A ribbon that renders "unmarked" during the read flashes off and on at
    // every mount -- the same class as the bookmark delete jump.
    mocks.loading = true;
    const { result } = renderHook(() => useKhatmMark('en'));
    expect(result.current.loading).toBe(true);
  });
});
