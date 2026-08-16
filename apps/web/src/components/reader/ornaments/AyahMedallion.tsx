import {
  MEDALLION_BACKING_PATH,
  MEDALLION_OUTLINE_PATH,
  MEDALLION_VIEW_BOX,
} from '@quran-corpus/config/ornaments/medallion';

interface AyahMedallionProps {
  n: number;
  className?: string;
}

/**
 * Ayah-marker rosette: the traditional mushaf 8-point notched star, with the
 * verse number centered inside. Art from temp/frames/medallion-1.svg; the
 * source cream fill + dark stroke are dropped for theme tokens so it adapts to
 * light/dark (CLAUDE.md §8) — a faint paper backing lifts the number, the
 * outline inherits `currentColor`.
 */
export function AyahMedallion({ n, className }: AyahMedallionProps) {
  return (
    <span
      aria-label={`Ayah ${n}`}
      role="img"
      className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center text-paper-600 dark:text-paper-200 ${className ?? ''}`.trim()}
    >
      <svg
        viewBox={MEDALLION_VIEW_BOX}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <path className="fill-paper-50 dark:fill-night-100" d={MEDALLION_BACKING_PATH} />
        <path
          className="fill-none stroke-current"
          strokeWidth={4}
          strokeLinejoin="round"
          d={MEDALLION_OUTLINE_PATH}
        />
      </svg>
      <span className="relative text-[0.65rem] font-medium tabular-nums">{n}</span>
    </span>
  );
}
