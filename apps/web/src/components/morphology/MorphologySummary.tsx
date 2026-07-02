import type { Word } from '@quran-corpus/data';

interface MorphologySummaryProps {
  word: Word;
  gloss?: string;
}

const chip =
  'rounded-full bg-paper-200 px-3 py-0.5 text-sm text-paper-700 dark:bg-night-100 dark:text-paper-300';

/**
 * Shared, non-interactive presenter for a word's morphology: transliteration,
 * gloss, verbatim English description, Arabic grammar label, and POS/root/lemma
 * chips. Reused by the reader popover and the full word-detail view (DRY).
 */
export function MorphologySummary({ word, gloss }: MorphologySummaryProps) {
  return (
    <div>
      {word.transliteration && (
        <p className="mb-1 text-lg text-paper-500">{word.transliteration}</p>
      )}

      {gloss && <p className="mb-4 text-base text-paper-700 dark:text-paper-300">{gloss}</p>}

      {word.morphology_description && (
        <p className="mb-4 text-sm leading-relaxed text-paper-700 dark:text-paper-300">
          {word.morphology_description}
        </p>
      )}

      {word.grammar_arabic && (
        <p dir="rtl" className="mb-4 font-arabic text-xl text-paper-800 dark:text-paper-200">
          {word.grammar_arabic}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {word.pos_tag && <span className={`${chip} font-medium`}>{word.pos_tag}</span>}
        {word.root && <span className={`${chip} font-arabic`}>{word.root}</span>}
        {word.lemma && <span className={`${chip} font-arabic`}>{word.lemma}</span>}
      </div>
    </div>
  );
}
