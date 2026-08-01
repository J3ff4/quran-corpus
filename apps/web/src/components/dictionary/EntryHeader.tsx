import type { ReactNode } from 'react';

interface EntryHeaderProps {
  /** The headword: a lemma's Arabic form, or a root's letters. */
  arabic: string;
  /** Latin reading, shown directly beneath the headword. Roots have none --
   *  `roots` carries no transliteration column, and the letter pills below
   *  already spell the consonants out. */
  transliteration?: string | null;
  /** The row between the transliteration and the count: grammar chips on the
   *  lemma page, letter pills on the root page. Callers pass a falsy value
   *  rather than an empty fragment when there is nothing to show, so the row
   *  and its margin collapse instead of leaving a gap. */
  children?: ReactNode;
  /** Corpus-wide occurrences, rendered as the "occurs N times" line. */
  count: number;
}

/**
 * Shared masthead for both dictionary entry pages.
 *
 * Centred stack rather than the previous left-aligned headword with a single
 * inline metadata row: transliteration, grammar and count were competing on
 * one line, so the reading of the word sat visually below its own footnotes.
 * Stacking them puts the Arabic first at full size and gives each piece of
 * metadata its own line in decreasing importance.
 *
 * Both pages render the same four slots, which is why this is one component
 * and not two near-identical headers (§3, DRY) -- the only asymmetry is that
 * roots have no transliteration.
 *
 * Muted text is paper-600/paper-400, not the paper-500 both headers used
 * before: paper-500 measures 3.08:1 on bg-paper-50, under the 4.5:1 WCAG AA
 * floor §8 sets. The replacement pair measures 4.73:1 light / 7.62:1 dark.
 */
export function EntryHeader({ arabic, transliteration, children, count }: EntryHeaderProps) {
  return (
    <header className="mb-8 text-center">
      {/* Sizes up on wider viewports only. The longest headword in the corpus
          is 8 base letters (مُسْتَهْزِءُون), ~200px at 48px against ~328px of
          usable width on a 360px screen, so nothing in the data wraps today;
          text-4xl below sm and break-words are defence for a longer form
          arriving, since a wrapped headword reads as two words. */}
      <h1
        dir="rtl"
        className="font-arabic break-words text-4xl leading-tight text-paper-900 sm:text-5xl dark:text-paper-100"
      >
        {arabic}
      </h1>
      {transliteration && (
        <p className="mt-1.5 text-base text-paper-600 dark:text-paper-400">{transliteration}</p>
      )}
      {children && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">{children}</div>
      )}
      <p className="mt-4 text-sm text-paper-600 dark:text-paper-400">
        occurs {count} time{count === 1 ? '' : 's'}
      </p>
    </header>
  );
}
