'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface IncrementalReveal<T extends HTMLElement = HTMLElement> {
  visibleCount: number;
  sentinelRef: React.RefObject<T | null>;
  done: boolean;
  revealTo: (n: number) => void;
}

/**
 * Track how many of `total` items are visible, growing by `step` when the
 * sentinel scrolls into view (IntersectionObserver) or on demand via
 * `revealTo`. Render-only pagination for long lists — no data is fetched.
 */
export function useIncrementalReveal<T extends HTMLElement = HTMLElement>(
  total: number,
  initial: number,
  step: number,
): IncrementalReveal<T> {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initial, total));
  const sentinelRef = useRef<T | null>(null);
  const done = visibleCount >= total;

  const revealTo = useCallback(
    (n: number) => {
      setVisibleCount((c) => Math.max(c, Math.min(n, total)));
    },
    [total],
  );

  useEffect(() => {
    if (done) return;
    // ponytail: assumes the sentinel mounts synchronously with the effect's
    // dependency change (our only consumer renders it conditionally in-tree).
    // A sentinel behind an async/Suspense boundary would need a callback ref.
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((c) => Math.min(c + step, total));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [done, step, total]);

  return { visibleCount, sentinelRef, done, revealTo };
}
