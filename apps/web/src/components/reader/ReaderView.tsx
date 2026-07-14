'use client';

import { useEffect, useState } from 'react';
import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { AyahView } from './AyahView';
import { Bismillah } from './ornaments/Bismillah';
import { WordPopover } from './WordPopover';
import { useAyahAudio } from '../../hooks/useAyahAudio';
import { useIncrementalReveal } from '../../hooks/useIncrementalReveal';
import { wordHref, wordLocation } from '../../lib/wordLocation';

// Render-only pagination: surahs longer than THRESHOLD ayahs mount INITIAL
// first and reveal STEP more per scroll, bounding initial DOM + hydration.
const THRESHOLD = 40;
const INITIAL = 20;
const STEP = 20;

interface ReaderViewProps {
  ayahs: Ayah[];
  wordsByAyah: Record<number, Word[]>;
  translationsByAyah: Record<number, Translation>;
  glossesByWordId: Record<number, { text: string; lang: string }>;
  lang: string;
}

export function ReaderView({
  ayahs,
  wordsByAyah,
  translationsByAyah,
  glossesByWordId,
  lang,
}: ReaderViewProps) {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const { playingAyahId, isPlaying, isRepeat, play, pause, toggleRepeat } = useAyahAudio(ayahs);
  const paginate = ayahs.length > THRESHOLD;
  const { visibleCount, sentinelRef, done, revealTo } = useIncrementalReveal<HTMLButtonElement>(
    ayahs.length,
    INITIAL,
    STEP,
  );

  // Keep the playing ayah on screen when audio auto-advances past the chunk.
  useEffect(() => {
    if (!paginate || playingAyahId == null) return;
    const idx = ayahs.findIndex((a) => a.id === playingAyahId);
    if (idx !== -1) revealTo(idx + 1);
  }, [paginate, playingAyahId, ayahs, revealTo]);

  const visible = paginate ? ayahs.slice(0, visibleCount) : ayahs;

  const selectedAyah = selectedWord ? ayahs.find((a) => a.id === selectedWord.ayah_id) : undefined;
  const selectedHref =
    selectedWord && selectedAyah ? wordHref(wordLocation(selectedAyah, selectedWord)) : undefined;

  const surahId = ayahs[0]?.surah_id;

  return (
    <div>
      {surahId != null && <Bismillah surahId={surahId} />}
      {visible.map((ayah) => (
        <AyahView
          key={ayah.id}
          ayah={ayah}
          words={wordsByAyah[ayah.id] ?? []}
          {...(translationsByAyah[ayah.id] != null
            ? { translation: translationsByAyah[ayah.id] }
            : {})}
          onWordClick={setSelectedWord}
          isThisPlaying={playingAyahId === ayah.id}
          isPlaying={isPlaying}
          isRepeat={isRepeat}
          onPlay={() => play(ayah)}
          onPause={pause}
          onToggleRepeat={toggleRepeat}
        />
      ))}
      {paginate && !done && (
        <button
          ref={sentinelRef}
          type="button"
          onClick={() => revealTo(visibleCount + STEP)}
          className="mx-auto mt-4 block rounded-full bg-paper-200 px-6 py-2 text-sm text-paper-700 transition-colors hover:bg-paper-300 dark:bg-night-100 dark:text-paper-300 dark:hover:bg-night-200"
        >
          Load more ayahs
        </button>
      )}
      <WordPopover
        word={selectedWord}
        {...(selectedWord != null && glossesByWordId[selectedWord.id] != null
          ? {
              gloss: glossesByWordId[selectedWord.id]!.text,
              glossLang: glossesByWordId[selectedWord.id]!.lang,
            }
          : {})}
        pageLang={lang}
        {...(selectedHref ? { href: selectedHref } : {})}
        onClose={() => setSelectedWord(null)}
      />
    </div>
  );
}
