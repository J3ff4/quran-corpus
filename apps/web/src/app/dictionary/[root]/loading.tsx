import { Skeleton } from '../../../components/ui/Skeleton';

/** Placeholder for a root entry while it streams: header + letter pills, a
 * definition card, and a few concordance rows. Mirrors RootEntry's layout so
 * the swap to real content doesn't shift. */
export default function RootLoading() {
  return (
    <main role="status" aria-busy="true" className="mx-auto max-w-2xl px-4 py-8">
      <span className="sr-only">Loading root…</span>
      <header className="mb-6">
        <Skeleton className="h-10 w-40" />
        <div className="mt-3 flex items-center gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="ml-2 h-4 w-28" />
        </div>
      </header>
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
