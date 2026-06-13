import type { Ayah, Word, Translation } from '@quran-corpus/data';

interface AyahViewProps {
  ayah: Ayah;
  words: Word[];
  translation?: Translation;
  onWordClick: (word: Word) => void;
}

export function AyahView({ ayah, words, translation, onWordClick }: AyahViewProps) {
  return (
    <article className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-200 text-xs text-paper-600 dark:bg-night-100 dark:text-paper-400">
          {ayah.ayah_number}
        </span>
      </div>
      <div dir="rtl" className="flex flex-wrap gap-x-1 gap-y-2 font-arabic text-3xl leading-loose">
        {words.length > 0 ? (
          words.map((word) => (
            <button
              key={word.id}
              onClick={() => onWordClick(word)}
              className="cursor-pointer rounded px-0.5 hover:bg-paper-200 dark:hover:bg-night-100"
            >
              {word.text_arabic}
            </button>
          ))
        ) : (
          <span>{ayah.text_uthmani}</span>
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
