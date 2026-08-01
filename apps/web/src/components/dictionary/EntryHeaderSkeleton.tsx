import type { ReactNode } from 'react';
import { Skeleton } from '../ui/Skeleton';

interface EntryHeaderSkeletonProps {
  /** Draw the transliteration bar. Lemmas have one, roots do not -- the same
   *  asymmetry EntryHeader's optional `transliteration` prop encodes. */
  transliteration?: boolean;
  /** The row between the transliteration and the count: sense chips on the
   *  lemma page, letter pills on the root page. Sizes differ, so the caller
   *  supplies the bars; this only owns the centred row and its margin. */
  children?: ReactNode;
}

/**
 * Loading placeholder for EntryHeader, shared by both dictionary entry pages.
 *
 * It lives beside EntryHeader rather than inside either `loading.tsx` because
 * the two must move together: the skeleton's whole job is that the swap to real
 * content doesn't shift, and a spacing change made to the header alone would
 * silently leave one or both fallbacks stale (§3, DRY). It stays in `apps/web`
 * -- `packages/data` is deliberately free of React and Next imports (§2), so a
 * component cannot go there.
 *
 * What it cannot mirror is content: `loading.tsx` receives no route params, so
 * neither page knows which entry is coming. Each caller passes the majority
 * shape for its own page and explains the trade in place.
 */
export function EntryHeaderSkeleton({ transliteration, children }: EntryHeaderSkeletonProps) {
  return (
    <header className="mb-8 text-center">
      {/* Tracks the real h1's box: text-4xl/leading-tight is 45px, and
          sm:text-5xl/leading-tight is 60px (leading-tight is emitted after
          the font-size utility, so 1.25 beats text-5xl's built-in 1). A
          flat h-11 shifted everything below the masthead by 16px on swap
          at >=640px. */}
      <Skeleton className="mx-auto h-11 w-40 sm:h-[3.75rem]" />
      {transliteration && <Skeleton className="mx-auto mt-1.5 h-6 w-24" />}
      {children && <div className="mt-4 flex justify-center gap-1.5">{children}</div>}
      <Skeleton className="mx-auto mt-4 h-5 w-28" />
    </header>
  );
}
