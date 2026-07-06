import { Skeleton } from '../../../../components/ui/Skeleton';

/** Placeholder for the word-by-word page: header, then a grid of word cells. */
export default function WordsLoading() {
  return (
    <main role="status" aria-busy="true" className="mx-auto max-w-2xl px-4 py-8">
      <span className="sr-only">Loading words…</span>
      <div className="mb-6 text-center">
        <Skeleton className="mx-auto h-8 w-48" />
        <Skeleton className="mx-auto mt-2 h-4 w-24" />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </main>
  );
}
