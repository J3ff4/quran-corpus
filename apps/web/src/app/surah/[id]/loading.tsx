import { Skeleton } from '../../../components/ui/Skeleton';

/** Placeholder for a surah reading page: header, language bar, and a few ayah
 * blocks (Arabic line + translation line). Mirrors the reader layout. */
export default function SurahLoading() {
  return (
    <main role="status" aria-busy="true" className="mx-auto max-w-2xl px-4 py-8">
      <span className="sr-only">Loading surah…</span>
      <div className="mb-6 text-center">
        <Skeleton className="mx-auto h-8 w-48" />
        <Skeleton className="mx-auto mt-2 h-4 w-32" />
      </div>
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="space-y-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="ml-auto h-8 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </main>
  );
}
