import { cookies } from 'next/headers';
import { getAllSurahs } from '@quran-corpus/data';
import { getDatabase } from '../../lib/db';
import { BOOKMARKS_COOKIE, getBookmarksFromCookie } from '../../lib/bookmarks';
import { BookmarksView } from './BookmarksView';
import { MigrateLegacyBookmarks } from './MigrateLegacyBookmarks';
import { toBookmarkRows } from './rows';

// Dynamic so the per-request CSP nonce reaches inline scripts (see app/page.tsx
// and src/test/route-render-mode.test.ts) — and so cookies() can be read, which
// is what lets the list render server-side instead of after hydration.
export const dynamic = 'force-dynamic';

export default async function BookmarksPage() {
  const db = await getDatabase();
  const surahs = await getAllSurahs(db);
  const cookieStore = await cookies();
  const rows = toBookmarkRows(
    getBookmarksFromCookie(cookieStore.get(BOOKMARKS_COOKIE)?.value),
    surahs,
  );

  return (
    <>
      <BookmarksView rows={rows} />
      <MigrateLegacyBookmarks />
    </>
  );
}
