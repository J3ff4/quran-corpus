import { BookmarksView } from './BookmarksView';

// Dynamic so the per-request CSP nonce reaches inline scripts (see app/page.tsx
// and src/test/route-render-mode.test.ts). Route segment config can only be
// exported from a Server Component, so the actual (client-only, localStorage-
// backed) UI lives in ./BookmarksView and this file is a thin wrapper.
export const dynamic = 'force-dynamic';

export default function BookmarksPage() {
  return <BookmarksView />;
}
