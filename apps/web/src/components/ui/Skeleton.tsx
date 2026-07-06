/**
 * A single shimmer placeholder bar. Pulse is disabled under
 * `prefers-reduced-motion`. Decorative — the surrounding loading region carries
 * the busy announcement, so each bar is aria-hidden.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-paper-200 motion-reduce:animate-none dark:bg-night-100 ${className}`}
    />
  );
}
