'use client';

import { useState } from 'react';
import { WbwAyahBlock } from './WbwAyahBlock';
import { WbwAyahListBlock } from './WbwAyahListBlock';
import { ViewToggle, type ViewMode } from './ViewToggle';
import { VIEW_MODE_COOKIE } from './viewMode';
import { writeCookie } from '../../lib/cookies';
import type { WbwAyah } from './types';

export function WbwAyahs({
  surahId,
  ayahs,
  pageLang,
  initialViewMode = 'card',
  bookmarkedAyahs,
}: {
  surahId: number;
  ayahs: WbwAyah[];
  pageLang?: string;
  initialViewMode?: ViewMode;
  bookmarkedAyahs: number[];
}) {
  const bookmarked = new Set(bookmarkedAyahs);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  function handleChange(mode: ViewMode) {
    setViewMode(mode);
    writeCookie(VIEW_MODE_COOKIE, mode);
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ViewToggle mode={viewMode} onChange={handleChange} />
      </div>
      {ayahs.map((ayah) =>
        viewMode === 'card' ? (
          <WbwAyahBlock
            key={ayah.ayahNumber}
            surahId={surahId}
            ayah={ayah}
            bookmarked={bookmarked.has(ayah.ayahNumber)}
            {...(pageLang ? { pageLang } : {})}
          />
        ) : (
          <WbwAyahListBlock
            key={ayah.ayahNumber}
            surahId={surahId}
            ayah={ayah}
            bookmarked={bookmarked.has(ayah.ayahNumber)}
            {...(pageLang ? { pageLang } : {})}
          />
        ),
      )}
    </div>
  );
}
