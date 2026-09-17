import Link from 'next/link';
import { SegmentPills } from '../morphology/SegmentPills';
import { GlossText } from '../shared/GlossText';
import type { WbwCell } from './types';

/** The words one gloss covers, under one gloss.
 *
 *  Same card as WbwWordCell, widened over the span: each word keeps its own
 *  link to its own page, because the span is a fact about the TRANSLATION and
 *  not about the morphology -- every word in it still has its own segments,
 *  root and grammar. Only the gloss line is shared, and it sits on this
 *  wrapper rather than being repeated under each word.
 *
 *  Border and hover are deliberately identical to WbwWordCell's; see the note
 *  there for why the hover moves the border and not the fill.
 */
export function WbwGlossSpan({ cells, pageLang }: { cells: WbwCell[]; pageLang?: string }) {
  const first = cells[0]!;
  // In WbwWordCell the gloss sits INSIDE the link, so tabbing the grid reads
  // "لَا, laa, not". Here the gloss is shared and sits on the wrapper, outside
  // every link -- without this each spanned word would announce only its pills
  // and transliteration, dropping the meaning for exactly the words whose
  // meaning is least guessable from the Arabic. Per (surah, ayah, position):
  // an id must be unique in the document and a page renders many ayahs.
  const glossId = `gloss-${first.surahId}-${first.ayahNumber}-${first.position}`;
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-paper-200 px-3 py-2 text-center dark:border-night-100">
      <div className="flex items-start gap-3" dir="rtl">
        {cells.map((cell) => (
          <Link
            key={cell.position}
            href={`/word/${cell.surahId}/${cell.ayahNumber}/${cell.position}`}
            aria-describedby={glossId}
            className="flex min-w-[3.5rem] flex-col items-center gap-1 rounded-lg transition-shadow hover:ring-2 hover:ring-paper-600"
          >
            <SegmentPills segments={cell.segments} fallbackWord={cell.arabic} />
            <span className="text-xs text-paper-500 dark:text-paper-400" dir="ltr">
              {cell.translit ?? '—'}
            </span>
          </Link>
        ))}
      </div>
      <span id={glossId} className="text-xs text-paper-700 dark:text-paper-300" dir="ltr">
        <GlossText gloss={first.gloss} glossLang={first.glossLang} pageLang={pageLang} />
      </span>
    </div>
  );
}
