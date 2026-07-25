'use client';

import { useEffect } from 'react';
import { recordSurahVisit } from '../../lib/reading-history';

/** Renders nothing; records the visit for the home page's "Read" section. */
export function RecordSurahVisit({ surahId }: { surahId: number }) {
  useEffect(() => {
    recordSurahVisit(surahId);
  }, [surahId]);

  return null;
}
