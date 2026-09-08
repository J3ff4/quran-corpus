/** Where the reader is, as the recorder queues it.
 *
 *  The page rides along rather than being recorded separately: both fields go
 *  into one row, and two recorders writing the same row would race each other
 *  to it. Null in translation mode, which still scrolls by ayah. */
export interface RecordedReadingPosition {
  ayahNumber: number;
  page: number | null;
}

export interface LatestReadingPositionRecorder {
  record: (position: RecordedReadingPosition) => void;
}

export function createLatestReadingPositionRecorder(
  persist: (position: RecordedReadingPosition) => Promise<void>,
  // Handed the raw cause, not a message: this module has no locale, and the
  // fallback wording for a non-Error throw is `reader.positionFailed`, which
  // only the caller can translate.
  onError: (cause: unknown) => void,
): LatestReadingPositionRecorder {
  let queued: RecordedReadingPosition | null = null;
  // SurahReader records from onViewableItemsChanged, which fires on every
  // scroll event while the same first ayah stays visible. Without this the
  // device takes one SQLite upsert per event to rewrite the row it just wrote.
  // Only set on success, so a failed write leaves the position re-recordable.
  let lastPersisted: RecordedReadingPosition | null = null;

  let writing = false;

  async function drainQueue() {
    if (writing) return;
    writing = true;

    try {
      while (queued != null) {
        const position = queued;
        queued = null;

        try {
          await persist(position);
          lastPersisted = position;
        } catch (cause) {
          onError(cause);
        }
      }
    } finally {
      writing = false;
      if (queued != null) void drainQueue();
    }
  }

  return {
    record(position) {
      // Both fields, not just the ayah: a page turn that lands on the same
      // opening ayah as the page before it is still a move, and skipping it
      // would leave the stored page one turn behind for the rest of the
      // session.
      if (
        position.ayahNumber === lastPersisted?.ayahNumber &&
        position.page === lastPersisted.page
      ) {
        return;
      }
      queued = position;
      void drainQueue();
    },
  };
}
