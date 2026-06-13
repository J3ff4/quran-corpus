'use client';

import { useState } from 'react';
import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { AyahView } from './AyahView';
import { WordPopover } from './WordPopover';

interface ReaderViewProps {
  ayahs: Ayah[];
  wordsByAyah: Record<number, Word[]>;
  translationsByAyah: Record<number, Translation>;
  lang: string;
}

export function ReaderView({ ayahs, wordsByAyah, translationsByAyah, lang: _lang }: ReaderViewProps) {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);

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
        />
      ))}
      <WordPopover word={selectedWord} onClose={() => setSelectedWord(null)} />
    </div>
  );
}
