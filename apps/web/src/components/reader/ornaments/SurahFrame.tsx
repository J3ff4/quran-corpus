import type { ReactNode } from 'react';

interface SurahFrameProps {
  children: ReactNode;
  className?: string;
}

/**
 * Small geometric arabesque end-cap: a tapering stem into a palmette-leaf
 * curve, capped by a diamond knot. Stroke-only so it inherits `currentColor`
 * from the surrounding text (theme-aware, no hardcoded hex).
 */
function EndCap() {
  return (
    <svg
      viewBox="0 0 44 20"
      width="44"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 opacity-70"
    >
      <path d="M40 10 L14 10" />
      <path d="M28 10 C24 4.5, 17 4.5, 13 10" />
      <path d="M28 10 C24 15.5, 17 15.5, 13 10" />
      <path d="M4 10 L8 6 L12 10 L8 14 Z" />
    </svg>
  );
}

export function SurahFrame({ children, className }: SurahFrameProps) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className ?? ''}`}>
      <EndCap />
      {children}
      <span className="-scale-x-100">
        <EndCap />
      </span>
    </div>
  );
}
