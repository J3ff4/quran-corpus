'use client';

// Route error boundary for /search: a DB or query failure renders this styled
// fallback instead of the default Next error page. The underlying error is not
// shown to avoid leaking internals (OWASP); `reset` retries the render.
export default function SearchError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold text-paper-900 dark:text-paper-100">Search</h1>
      <p className="mb-4 text-paper-600 dark:text-paper-300">
        Something went wrong running that search. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-paper-800 px-4 py-2 text-sm font-medium text-paper-50 dark:bg-night-100 dark:text-paper-100"
      >
        Try again
      </button>
    </main>
  );
}
