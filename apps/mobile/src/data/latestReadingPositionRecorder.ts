export interface LatestReadingPositionRecorder {
  record: (ayahNumber: number) => void;
}

export function createLatestReadingPositionRecorder(
  persist: (ayahNumber: number) => Promise<void>,
  onError: (message: string) => void,
): LatestReadingPositionRecorder {
  let queuedAyah: number | null = null;
  let writing = false;

  async function drainQueue() {
    if (writing) return;
    writing = true;

    try {
      while (queuedAyah != null) {
        const ayahNumber = queuedAyah;
        queuedAyah = null;

        try {
          await persist(ayahNumber);
        } catch (cause) {
          onError(cause instanceof Error ? cause.message : 'Unable to update reading history');
        }
      }
    } finally {
      writing = false;
      if (queuedAyah != null) void drainQueue();
    }
  }

  return {
    record(ayahNumber) {
      queuedAyah = ayahNumber;
      void drainQueue();
    },
  };
}
