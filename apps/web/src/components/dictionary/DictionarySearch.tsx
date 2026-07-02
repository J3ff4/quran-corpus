interface DictionarySearchProps {
  defaultValue?: string;
}

/**
 * Root/meaning search. Plain GET form → `/dictionary?q=…`, server-rendered
 * results; no client JS needed (ponytail).
 */
export function DictionarySearch({ defaultValue }: DictionarySearchProps) {
  return (
    <form role="search" action="/dictionary" method="get" className="mb-6 flex gap-2">
      <input
        type="search"
        name="q"
        aria-label="Search roots or meaning"
        defaultValue={defaultValue}
        placeholder="Search roots or meaning…"
        className="flex-1 rounded-lg border border-paper-300 bg-paper-50 px-4 py-2 text-paper-900 placeholder:text-paper-400 focus:border-paper-500 focus:outline-none dark:border-night-100 dark:bg-night-50 dark:text-paper-100"
      />
      <button
        type="submit"
        className="rounded-lg bg-paper-800 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-paper-900 dark:bg-night-100 dark:text-paper-100 dark:hover:bg-night-50"
      >
        Search
      </button>
    </form>
  );
}
