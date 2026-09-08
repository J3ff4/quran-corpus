import * as Font from 'expo-font';
import { useEffect, useState } from 'react';

import { MUSHAF_FONT_ASSETS } from './fontManifest.generated';

export const MUSHAF_PAGE_MIN = 1;
export const MUSHAF_PAGE_MAX = 604;

/** Matches the font's own name table (`QCF2106`), so a family mismatch shows up
 *  in a font dump rather than as blank text. */
export function mushafFontFamily(page: number): string {
  if (!Number.isInteger(page) || page < MUSHAF_PAGE_MIN || page > MUSHAF_PAGE_MAX) {
    throw new RangeError(
      `mushaf page must be an integer ${MUSHAF_PAGE_MIN}..${MUSHAF_PAGE_MAX}, got ${page}`,
    );
  }
  return `QCF2${String(page).padStart(3, '0')}`;
}

// Families already registered this process. expo-font has no unload, so this
// only ever grows -- 604 fonts is the ceiling, and a reader visits a handful.
const loaded = new Set<string>();

/** Tests only. */
export function resetLoadedFontsForTest(): void {
  loaded.clear();
}

/**
 * Register one page's font, once.
 *
 * A resolved `loadAsync` is NOT proof the font applied: a WOFF2 resolves and
 * then silently falls back (M7a §4). These are TTFs precisely because of that,
 * and the device check in Task 8 is what actually proves registration.
 */
export async function loadMushafPageFont(page: number): Promise<string> {
  const family = mushafFontFamily(page);
  if (loaded.has(family)) return family;

  const asset = MUSHAF_FONT_ASSETS[page];
  if (asset === undefined) {
    // Every page 1..604 is in the generated manifest, so a gap means the
    // manifest is stale. Saying so beats handing expo-font `undefined`, which
    // it accepts and then registers nothing for.
    throw new Error(
      `no bundled font for mushaf page ${page}; run \`pnpm generate:mushaf-manifest\``,
    );
  }

  // Marked loaded only after the await resolves: a failure must be retryable,
  // not poison the page for the life of the process.
  await Font.loadAsync({ [family]: asset });
  loaded.add(family);
  return family;
}

export function useMushafPageFont(page: number): {
  family: string;
  ready: boolean;
  error: Error | null;
} {
  const family = mushafFontFamily(page);
  const [ready, setReady] = useState(() => loaded.has(family));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setReady(loaded.has(family));
    loadMushafPageFont(page)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [family, page]);

  return { family, ready, error };
}
