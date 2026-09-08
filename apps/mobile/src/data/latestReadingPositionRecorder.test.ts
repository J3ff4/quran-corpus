import { describe, expect, it, vi } from 'vitest';
import {
  createLatestReadingPositionRecorder,
  type RecordedReadingPosition,
} from './latestReadingPositionRecorder';
import { deferred } from '../testing/deferred';

/** A scrolled position, which carries no page. */
const at = (ayahNumber: number): RecordedReadingPosition => ({ surahId: 1, ayahNumber, page: null });

describe('createLatestReadingPositionRecorder', () => {
  it('serializes overlapping writes so the newest queued ayah is persisted last', async () => {
    const firstWrite = deferred<void>();
    const writes: number[] = [];
    const persist = vi.fn(async ({ ayahNumber }: RecordedReadingPosition) => {
      writes.push(ayahNumber);
      if (ayahNumber === 1) await firstWrite.promise;
    });
    const recorder = createLatestReadingPositionRecorder(persist, vi.fn());

    recorder.record(at(1));
    recorder.record(at(2));
    recorder.record(at(3));
    await Promise.resolve();

    expect(writes).toEqual([1]);

    firstWrite.resolve();
    await vi.waitFor(() => expect(writes).toEqual([1, 3]));
  });

  it('skips a repeat of the position it just wrote', async () => {
    const persist = vi.fn(async () => undefined);
    const recorder = createLatestReadingPositionRecorder(persist, vi.fn());

    recorder.record(at(255));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));

    // onViewableItemsChanged fires repeatedly with the same first ayah while
    // the user scrolls within it; each of these used to cost an upsert.
    recorder.record(at(255));
    recorder.record(at(255));
    await Promise.resolve();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('reports a failed write and keeps draining later positions', async () => {
    const onError = vi.fn();
    const persist = vi.fn(async ({ ayahNumber }: RecordedReadingPosition) => {
      if (ayahNumber === 1) throw new Error('disk full');
    });
    const recorder = createLatestReadingPositionRecorder(persist, onError);

    recorder.record(at(1));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('disk full')));

    // A rejected write must not wedge the queue: the recorder is the only path
    // reading position takes, so a single failure would otherwise mean the app
    // stops recording for the rest of the session.
    recorder.record(at(2));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledWith(at(2)));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('records a page turn that lands on the ayah already stored', async () => {
    // Two pages can open on the same ayah -- a long one spans several. Keying
    // the skip on the ayah alone left the stored page a turn behind for the
    // rest of the session.
    const persist = vi.fn(async () => undefined);
    const recorder = createLatestReadingPositionRecorder(persist, vi.fn());

    recorder.record({ surahId: 1, ayahNumber: 1, page: 106 });
    // Awaited: the skip compares against the last *persisted* position, so a
    // second record before the first write lands is queued regardless and
    // proves nothing about the comparison.
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));

    recorder.record({ surahId: 1, ayahNumber: 1, page: 107 });

    await vi.waitFor(() =>
      expect(persist).toHaveBeenCalledWith({ surahId: 1, ayahNumber: 1, page: 107 }),
    );
  });

  it('records a page turn that crosses into the next surah at its ayah 1', async () => {
    // 51 pages hold more than one surah. Page 108 opens 2:1 where page 107
    // opened 1:5 -- same ayah number would not collide here, but a page whose
    // first ayah is 1 following a surah that ended on ayah 1 does, and the
    // stored surah would then stay a page behind.
    const persist = vi.fn(async () => undefined);
    const recorder = createLatestReadingPositionRecorder(persist, vi.fn());

    recorder.record({ surahId: 1, ayahNumber: 1, page: 106 });
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));

    recorder.record({ surahId: 2, ayahNumber: 1, page: 106 });

    await vi.waitFor(() =>
      expect(persist).toHaveBeenCalledWith({ surahId: 2, ayahNumber: 1, page: 106 }),
    );
  });
});