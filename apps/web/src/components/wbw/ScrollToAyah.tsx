'use client';

import { useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';

export function ScrollToAyah({ ayah }: { ayah: number }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = document.getElementById(`ayah-${ayah}`);
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [ayah, reduce]);
  return null;
}
