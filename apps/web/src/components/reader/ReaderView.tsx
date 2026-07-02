'use client';

import { useState } from 'react';
import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { AyahView } from './AyahView';
import { WordPopover } from './WordPopover';
import { useAyahAudio } from '../../hooks/useAyahAudio';
import { wordHref, wordLocation } from '../../lib/wordLocation';

interface ReaderViewProps {
  ayahs: Ayah[];
  wordsByAyah: Record<number, Word[]>;
  translationsByAyah: Record<number, Translation>;
  glossesByWordId: Record<number, string>;
  lang: string;
}

export function ReaderView({
  ayahs,
  wordsByAyah,
  translationsByAyah,
  glossesByWordId,
  lang: _lang,
}: ReaderViewProps) {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const { playingAyahId, isPlaying, isRepeat, play, pause, toggleRepeat } = useAyahAudio(ayahs);

  const selectedAyah = selectedWord ? ayahs.find((a) => a.id === selectedWord.ayah_id) : undefined;
  const selectedHref =
    selectedWord && selectedAyah ? wordHref(wordLocation(selectedAyah, selectedWord)) : undefined;

  return (
    <div>
      {ayahs.map((ayah) => (
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
      <WordPopover
        word={selectedWord}
        {...(selectedWord != null && glossesByWordId[selectedWord.id] != null
          ? { gloss: glossesByWordId[selectedWord.id] }
          : {})}
        {...(selectedHref ? { href: selectedHref } : {})}
        onClose={() => setSelectedWord(null)}
      />
    </div>
  );
}
