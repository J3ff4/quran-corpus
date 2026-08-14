import { describe, expect, it, vi } from 'vitest';
import { createLatestReadingPositionRecorder } from './latestReadingPositionRecorder';

describe('createLatestReadingPositionRecorder', () => {
  it('serializes overlapping writes so the newest queued ayah is persisted last', async () => {
    const firstWrite = deferred<void>();
    const writes: number[] = [];
    const persist = vi.fn(async (ayahNumber: number) => {
      writes.push(ayahNumber);
      if (ayahNumber === 1) await firstWrite.promise;
    });
    const recorder = createLatestReadingPositionRecorder(persist, vi.fn());

    recorder.record(1);
    recorder.record(2);
    recorder.record(3);
    await Promise.resolve();

    expect(writes).toEqual([1]);

    firstWrite.resolve();
    await vi.waitFor(() => expect(writes).toEqual([1, 3]));
  });

  it('skips a repeat of the position it just wrote', async () => {
    const persist = vi.fn(async () => undefined);
    const recorder = createLatestReadingPositionRecorder(persist, vi.fn());

    recorder.record(255);
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));

    // onViewableItemsChanged fires repeatedly with the same first ayah while
    // the user scrolls within it; each of these used to cost an upsert.
    recorder.record(255);
    recorder.record(255);
    await Promise.resolve();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('reports a failed write and keeps draining later positions', async () => {
    const onError = vi.fn();
    const persist = vi.fn(async (ayahNumber: number) => {
      if (ayahNumber === 1) throw new Error('disk full');
    });
    const recorder = createLatestReadingPositionRecorder(persist, onError);

    recorder.record(1);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('disk full'));

    // A rejected write must not wedge the queue: the recorder is the only path
    // reading position takes, so a single failure would otherwise mean the app
    // stops recording for the rest of the session.
    recorder.record(2);
    await vi.waitFor(() => expect(persist).toHaveBeenCalledWith(2));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
