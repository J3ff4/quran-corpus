export function SajdahMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Verse of Prostration (Sajdah)"
      className={`font-arabic text-2xl text-paper-600 dark:text-paper-200 ${className ?? ''}`.trim()}
    >
      ۩
    </span>
  );
}
