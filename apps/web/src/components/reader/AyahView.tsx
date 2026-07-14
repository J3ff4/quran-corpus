import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { WordToken } from './WordToken';
import { AyahAudioButton } from './AyahAudioButton';
import { AyahMedallion } from './ornaments/AyahMedallion';

interface AyahViewProps {
  ayah: Ayah;
  words: Word[];
  translation?: Translation;
  onWordClick: (word: Word) => void;
  isThisPlaying: boolean;
  isPlaying: boolean;
  isRepeat: boolean;
  onPlay: () => void;
  onPause: () => void;
  onToggleRepeat: () => void;
}

export function AyahView({
  ayah,
  words,
  translation,
  onWordClick,
  isThisPlaying,
  isPlaying,
  isRepeat,
  onPlay,
  onPause,
  onToggleRepeat,
}: AyahViewProps) {
  return (
    <article className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <AyahMedallion n={ayah.ayah_number} />
        <AyahAudioButton
          ayah={ayah}
          isThisPlaying={isThisPlaying}
          isPlaying={isPlaying}
          isRepeat={isRepeat}
          onPlay={onPlay}
          onPause={onPause}
          onToggleRepeat={onToggleRepeat}
        />
      </div>

      <div dir="rtl" className="flex flex-wrap gap-x-1 gap-y-2 font-arabic text-3xl leading-[2.4]">
        {words.length > 0 ? (
          words.map((word) => (
            <WordToken key={word.id} word={word} onClick={onWordClick} />
          ))
        ) : (
          <span className="text-paper-900 dark:text-paper-100">{ayah.text_uthmani}</span>
        )}
      </div>

      {translation && (
        <p className="mt-4 text-base leading-relaxed text-paper-600 dark:text-paper-400">
          {translation.text}
        </p>
      )}
    </article>
  );
}
