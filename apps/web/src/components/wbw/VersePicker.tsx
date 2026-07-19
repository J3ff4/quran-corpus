'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PickerSurah } from './types';

const selectClass =
  'rounded-lg border border-paper-300 bg-paper-50 px-3 py-2 text-paper-900 dark:border-night-100 dark:bg-night-50 dark:text-paper-100';

export function VersePicker({
  surahs,
  onNavigate,
}: {
  surahs: PickerSurah[];
  /** Called after pushing the route — e.g. to close the sheet that hosts this picker. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [surahId, setSurahId] = useState(surahs[0]?.id ?? 1);
  const [ayah, setAyah] = useState(1);

  const ayahCount = surahs.find((s) => s.id === surahId)?.ayah_count ?? 1;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-paper-500 dark:text-paper-400">
        Surah
        <select
          className={selectClass}
          value={surahId}
          onChange={(e) => {
            setSurahId(Number(e.target.value));
            setAyah(1);
          }}
        >
          {surahs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}. {s.name_translit}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-paper-500 dark:text-paper-400">
        Ayah
        <select className={selectClass} value={ayah} onChange={(e) => setAyah(Number(e.target.value))}>
          {Array.from({ length: ayahCount }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        aria-label="Go to selected verse"
        onClick={() => {
          router.push(`/surah/${surahId}/words?ayah=${ayah}`);
          onNavigate?.();
        }}
        className="rounded-lg bg-paper-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-paper-700 dark:bg-paper-100 dark:text-night-300 dark:hover:bg-paper-300"
      >
        Go
      </button>
    </div>
  );
}
