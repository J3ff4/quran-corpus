import { EntryHeaderSkeleton } from '../../../components/dictionary/EntryHeaderSkeleton';
import { Skeleton } from '../../../components/ui/Skeleton';

/** Placeholder for a root entry while it streams: header + letter pills, a
 * definition card, and a few concordance rows. Mirrors RootEntry's layout so
 * the swap to real content doesn't shift. */
export default function RootLoading() {
  return (
    <main role="status" aria-busy="true" className="mx-auto max-w-2xl px-4 py-8">
      <span className="sr-only">Loading root…</span>
      {/* No transliteration bar: roots have none, so the letter pills sit
          directly under the headword.

          Three pills because loading.tsx receives no params -- it cannot know
          which root is coming. Right for 1602 of 1642 roots; the 40
          quadriliterals gain a pill's width on swap. Centred, so that shows up
          as the row growing outward rather than the whole masthead sliding. */}
      <EntryHeaderSkeleton>
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-9" />
      </EntryHeaderSkeleton>
      {/* The prev/next row is its own sibling now that the header is centred. */}
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Skeleton className="mb-3 h-4 w-32" />
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
