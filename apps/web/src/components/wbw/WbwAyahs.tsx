'use client';

import { useState } from 'react';
import { WbwAyahBlock } from './WbwAyahBlock';
import { WbwAyahListBlock } from './WbwAyahListBlock';
import { ViewToggle, type ViewMode } from './ViewToggle';
import { VIEW_MODE_COOKIE } from './viewMode';
import type { WbwAyah } from './types';

// One year: long enough to feel permanent, short enough to self-heal if
// the format ever changes.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function WbwAyahs({
  surahId,
  ayahs,
  pageLang,
  initialViewMode = 'card',
}: {
  surahId: number;
  ayahs: WbwAyah[];
  pageLang?: string;
  initialViewMode?: ViewMode;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  function handleChange(mode: ViewMode) {
    setViewMode(mode);
    document.cookie = `${VIEW_MODE_COOKIE}=${mode}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ViewToggle mode={viewMode} onChange={handleChange} />
      </div>
      {ayahs.map((ayah) =>
        viewMode === 'card' ? (
          <WbwAyahBlock key={ayah.ayahNumber} surahId={surahId} ayah={ayah} {...(pageLang ? { pageLang } : {})} />
        ) : (
          <WbwAyahListBlock
            key={ayah.ayahNumber}
            surahId={surahId}
            ayah={ayah}
            {...(pageLang ? { pageLang } : {})}
          />
        ),
      )}
    </div>
  );
}
