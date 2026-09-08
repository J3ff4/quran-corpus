import { describe, expect, it, vi } from 'vitest';
import {
  createLatestReadingPositionRecorder,
  type RecordedReadingPosition,
} from './latestReadingPositionRecorder';
import { deferred } from '../testing/deferred';

/** A scrolled position, which carries no page. */
const at = (ayahNumber: number): RecordedReadingPosition => ({ ayahNumber, page: null });

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

    recorder.record({ ayahNumber: 1, page: 106 });
    // Awaited: the skip compares against the last *persisted* position, so a
    // second record before the first write lands is queued regardless and
    // proves nothing about the comparison.
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));

    recorder.record({ ayahNumber: 1, page: 107 });

    await vi.waitFor(() => expect(persist).toHaveBeenCalledWith({ ayahNumber: 1, page: 107 }));
  });
});