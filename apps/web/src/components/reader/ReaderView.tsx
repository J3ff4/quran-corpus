'use client';

import { useState } from 'react';
import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { AyahView } from './AyahView';
import { WordPopover } from './WordPopover';
import { useAyahAudio } from '../../hooks/useAyahAudio';

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
        onClose={() => setSelectedWord(null)}
      />
    </div>
  );
}
