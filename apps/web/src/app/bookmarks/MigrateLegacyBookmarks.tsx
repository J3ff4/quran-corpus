'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { migrateLegacyBookmarks } from '../../lib/bookmarks';

/**
 * Renders nothing. Moves pre-cookie localStorage bookmarks into the cookie the
 * server reads, then re-renders so they show up — the server can't see
 * localStorage, so without this an upgrading user's page reads "No bookmarks
 * yet" until their next toggle.
 * ponytail: delete along with migrateLegacyBookmarks once users have migrated.
 */
export function MigrateLegacyBookmarks() {
  const router = useRouter();

  useEffect(() => {
    if (migrateLegacyBookmarks()) router.refresh();
  }, [router]);

  return null;
}
