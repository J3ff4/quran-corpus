import type { DecodedSegment } from '@quran-corpus/data';
import { chip } from '../ui/chip';
import { posColor } from '../../lib/posColor';

interface SegmentCardProps {
  segment: DecodedSegment;
  index: number;
}

/** One morphological segment in the word page's Full Analysis list: its role,
 *  POS label in both languages, grammatical features, and root/lemma. Colour
 *  on the English label comes from the shared --pos-* palette, so a segment
 *  reads the same here as in the pills at the top of the page. */
export function SegmentCard({ segment, index }: SegmentCardProps) {
  const { role, pos, features, rootArabic, lemma, unknownTags } = segment;
  // Same function, same --pos-* buckets as the pills at the top of this page,
  // so a preposition is the one green in both places. The dictionary's
  // --form-* palette was the other candidate and was rejected: it buckets
  // derived forms (verb / participle / noun), so every particle and pronoun
  // a segment card actually shows would collapse into one grey, and
  // "Preposition" would read grey here while its pill 2cm above stayed green.
  const color = posColor(pos.code);

  return (
    <div className="rounded-xl border border-paper-200 p-4 dark:border-night-100">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-paper-500">
          {index + 1}. {role}
        </span>
        {/* Colour rides on the label text with no fill, at the same
            `text-sm font-medium` the dictionary's FormFilterChips uses. Every
            --pos-* token clears 4.5:1 as text with room to spare here, since
            the palette is calibrated for the harder tinted-pill case (see
            globals.css) and this card has no background of its own. Colour is
            never the only carrier -- the label spells the category out.

            posColor returns null for DET. That case keeps the same size and
            weight and only drops the colour, rather than falling back to the
            filled `chip`: a fill is louder than plain text, so the chip made
            the one segment the corpus deliberately does NOT treat as its own
            category the loudest label on the page.

            The neutral pair is picked to sit at the quiet end of the coloured
            labels' contrast band rather than above it, or it re-creates that
            same inversion without the fill. Measured against the page colour
            (paper-50 / night-300, since the card only draws a border), the
            --pos-* labels run 5.79-7.02:1 light and 7.64-10.39:1 dark;
            paper-600/paper-400 land just under both bands at 4.73:1 and
            7.62:1. paper-700/paper-300, the usual pair, measure 7.34:1 and
            10.81:1 -- louder than every real category in both themes. */}
        <span
          className={`text-sm font-medium ${color ? '' : 'text-paper-600 dark:text-paper-400'}`}
          style={color ? { color } : undefined}
        >
          {pos.en}
        </span>
        {/* Arabic label stays neutral: doubling the colour on a second copy of
            the same fact adds noise, and Arabic's thinner strokes are the worse
            place to spend the contrast budget. */}
        {pos.ar && (
          <span className={`${chip} font-arabic`} dir="rtl">
            {pos.ar}
          </span>
        )}
      </div>

      {features.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {features.map((f, i) => (
            <span key={`${f.key}-${i}`} className={chip}>
              {f.label ? (
                <>
                  <span className="font-medium">{f.label}</span>: <span>{f.value}</span>
                </>
              ) : (
                f.value
              )}
            </span>
          ))}
        </div>
      )}

      {unknownTags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {unknownTags.map((t, i) => (
            <span key={`${t}-${i}`} className={`${chip} font-mono`}>
              {t}
            </span>
          ))}
        </div>
      )}

      {(rootArabic || lemma) && (
        <div className="mt-2 flex flex-wrap gap-2" dir="rtl">
          {rootArabic && (
            <span className="font-arabic text-sm text-paper-700 dark:text-paper-300">
              {rootArabic}
            </span>
          )}
          {lemma && (
            <span className="font-arabic text-sm text-paper-700 dark:text-paper-300">
              {lemma}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
