import { Skeleton } from '../../../../components/ui/Skeleton';

/** Placeholder for a lemma entry while it streams: header + meta line, the
 * quick-meaning line, the root-definition card, and a few concordance rows.
 * Mirrors LemmaEntry's layout so the swap to real content doesn't shift.
 *
 * The page is `force-dynamic` and runs several sequential DB round-trips
 * (entry, modal form, gloss, root definition, first concordance page), so
 * without this the tap on a frequency row sits on the old screen with no
 * feedback. The root page has had the same treatment since it shipped.
 *
 * The root-definition card is drawn unconditionally even though 175 rootless
 * lemmas render no card at all -- the skeleton cannot know which it is, and a
 * placeholder that resolves to nothing is a smaller lie than the reverse. */
export default function LemmaLoading() {
  return (
    <main role="status" aria-busy="true" className="mx-auto max-w-2xl px-4 py-8">
      <span className="sr-only">Loading lemma…</span>
      <header className="mb-6">
        <Skeleton className="h-10 w-40" />
        <div className="mt-2 flex items-center gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-24" />
        </div>
      </header>
      <Skeleton className="mb-6 h-5 w-48" />
      <Skeleton className="mb-8 h-20 w-full" />
      <Skeleton className="mb-2 h-4 w-32" />
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
