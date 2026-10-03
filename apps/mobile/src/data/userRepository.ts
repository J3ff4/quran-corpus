// The user-DB queries themselves live in packages/data (`./user-db`); this file
// only re-exports them under the path the screens already import. Keeping the
// SQL here would have been a second copy of schema-coupled query logic inside an
// app, which CLAUDE.md §2 forbids -- packages/data is the single source of truth
// for both the schema and the statements that read it.
export {
  NOTE_MAX_LENGTH,
  countDistinctRootsViewed,
  getBookmarks,
  getKhatmPage,
  getLastReadingPosition,
  getReadingDays,
  getRootViewsByDay,
  getSetting,
  isIsoDay,
  recordReadingDay,
  recordReadingPosition,
  recordRootView,
  saveSetting,
  setBookmark,
  setBookmarkNote,
  setKhatmPage,
  type Bookmark,
  type KhatmPageInput,
  type ReadingPosition,
} from '@quran-corpus/data/user-db';
