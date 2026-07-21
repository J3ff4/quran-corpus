export type ViewMode = 'card' | 'list';

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'card', label: 'Card' },
  { mode: 'list', label: 'List' },
];

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div
      role="group"
      aria-label="Word-by-word view"
      className="inline-flex rounded-full border border-paper-200 p-0.5 dark:border-night-100"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          aria-pressed={mode === opt.mode}
          onClick={() => onChange(opt.mode)}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${
            mode === opt.mode
              ? 'bg-paper-900 text-paper-50 dark:bg-paper-100 dark:text-night-300'
              : 'text-paper-600 hover:bg-paper-100 dark:text-paper-400 dark:hover:bg-night-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
