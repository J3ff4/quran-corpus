export interface LatestReadingPositionRecorder {
  record: (ayahNumber: number) => void;
}

export function createLatestReadingPositionRecorder(
  persist: (ayahNumber: number) => Promise<void>,
  onError: (message: string) => void,
): LatestReadingPositionRecorder {
  let queuedAyah: number | null = null;
  // SurahReader records from onViewableItemsChanged, which fires on every
  // scroll event while the same first ayah stays visible. Without this the
  // device takes one SQLite upsert per event to rewrite the row it just wrote.
  // Only set on success, so a failed write leaves the position re-recordable.
  let lastPersistedAyah: number | null = null;
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
          lastPersistedAyah = ayahNumber;
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
      if (ayahNumber === lastPersistedAyah) return;
      queuedAyah = ayahNumber;
      void drainQueue();
    },
  };
}
