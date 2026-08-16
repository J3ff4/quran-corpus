import { posBucket } from '@quran-corpus/data/client';

/**
 * Maps a POS tag to a theme-aware CSS variable reference, or null for "no
 * colour" (render as plain default text). The tag→bucket decision lives in
 * packages/data/src/morphology/buckets.ts so mobile can share it; this file is
 * only the web half, bucket→var().
 */
export function posColor(posTag: string | null): string | null {
  const bucket = posBucket(posTag);
  return bucket ? `var(--pos-${bucket})` : null;
}
