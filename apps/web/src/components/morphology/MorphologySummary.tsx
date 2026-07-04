import type { Word } from '@quran-corpus/data';

interface MorphologySummaryProps {
  word: Word;
  gloss?: string;
}

const chip =
  'rounded-full bg-paper-200 px-3 py-0.5 text-sm text-paper-700 dark:bg-night-100 dark:text-paper-300';

/**
 * Shared, non-interactive header presenter for a word: transliteration, gloss,
 * and POS/root/lemma chips. Verbatim prose + Arabic grammar now live in the
 * FullAnalysis collapsible on the word page (kept out of here so the reader
 * popover stays compact). Reused by the reader popover and word-detail view.
 */
export function MorphologySummary({ word, gloss }: MorphologySummaryProps) {
  return (
    <div>
      {word.transliteration && (
        <p className="mb-1 text-lg text-paper-500">{word.transliteration}</p>
      )}

      {gloss && <p className="mb-4 text-base text-paper-700 dark:text-paper-300">{gloss}</p>}

      <div className="flex flex-wrap gap-2">
        {word.pos_tag && <span className={`${chip} font-medium`}>{word.pos_tag}</span>}
        {word.root && <span className={`${chip} font-arabic`}>{word.root}</span>}
        {word.lemma && <span className={`${chip} font-arabic`}>{word.lemma}</span>}
      </div>
    </div>
  );
}
