import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p dir="rtl" className="mb-6 font-arabic text-7xl text-paper-900 dark:text-paper-100" aria-hidden="true">
        ق
      </p>
      <h2 className="mb-2 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        You&rsquo;re offline
      </h2>
      <p className="mb-8 max-w-xs text-paper-600 dark:text-paper-400">
        No internet connection. Surahs you&rsquo;ve visited before are still available.
      </p>
      <Link
        href="/surah"
        className="rounded-lg bg-paper-900 px-5 py-2.5 text-sm font-medium text-paper-50 transition-colors hover:bg-paper-700 dark:bg-paper-100 dark:text-night-300 dark:hover:bg-paper-200"
      >
        Browse cached surahs
      </Link>
    </main>
  );
}
