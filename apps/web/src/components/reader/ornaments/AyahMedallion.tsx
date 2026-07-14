interface AyahMedallionProps {
  n: number;
  className?: string;
}

/**
 * Ayah-marker rosette: an 8-point star outline evoking the traditional
 * mushaf verse-end medallion, with the verse number centered inside.
 * Stroke-only so it inherits `currentColor` (theme-aware, no hardcoded hex).
 */
export function AyahMedallion({ n, className }: AyahMedallionProps) {
  return (
    <span
      aria-label={`Ayah ${n}`}
      className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center text-paper-600 dark:text-paper-400 ${className ?? ''}`}
    >
      <svg
        viewBox="0 0 28 28"
        className="absolute inset-0 h-full w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 2 L17 8 L23.4 5.6 L20.4 11.6 L26 14 L20.4 16.4 L23.4 22.4 L17 20 L14 26 L11 20 L4.6 22.4 L7.6 16.4 L2 14 L7.6 11.6 L4.6 5.6 L11 8 Z" />
      </svg>
      <span className="relative text-[0.65rem] font-medium tabular-nums">{n}</span>
    </span>
  );
}
