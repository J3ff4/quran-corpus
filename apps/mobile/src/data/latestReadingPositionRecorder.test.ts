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
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
