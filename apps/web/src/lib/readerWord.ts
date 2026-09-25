import type { Word } from '@quran-corpus/data/client';

/**
 * The fields of a `Word` the reader actually renders.
 *
 * `/surah/2` shipped 4.82 MB of HTML for 633 DOM elements, and the bulk was
 * the RSC flight payload rather than markup: `getWordsBySurah` selects `w.*`,
 * and every column of all 6116 words crossed the server/client boundary into
 * `ReaderView`. Measured on surah 2, the words payload is 2.00 MB of JSON, of
 * which **1.74 MB (87%) is columns nothing on the page reads** --
 * `morphology_description` alone is 1.33 MB.
 *
 * Nothing here is a loss of function. `MorphologySummary`, the reader
 * popover's body, uses transliteration/pos_tag/root/lemma and says so in its
 * own docstring: the verbatim prose and Arabic grammar moved to the
 * FullAnalysis collapsible on `/word/...`, which fetches its own row.
 *
 * This is a type, not a convention, so the boundary cannot quietly widen
 * again: adding a field to the reader means adding it here first, where the
 * cost is visible. `Word` stays assignable to it, so the components below are
 * still reusable from the word-detail page, which does want the full row.
 */
export type ReaderWord = Pick<
  Word,
  'id' | 'ayah_id' | 'position' | 'text_arabic' | 'transliteration' | 'root' | 'lemma' | 'pos_tag'
>;

export function toReaderWord(word: Word): ReaderWord {
  return {
    id: word.id,
    ayah_id: word.ayah_id,
    position: word.position,
    text_arabic: word.text_arabic,
    transliteration: word.transliteration,
    root: word.root,
    lemma: word.lemma,
    pos_tag: word.pos_tag,
  };
}
