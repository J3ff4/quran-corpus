/** A word's gloss, tagged with its language when that is not the one asked for.
 *
 *  The fallback tag is the whole reason this is shared: the reader popover,
 *  the word-by-word card and the word-by-word row all show a gloss that may
 *  have come from a language other than the page's, and all three said so in
 *  their own copy of this markup.
 */
export function GlossText({
  gloss,
  glossLang,
  pageLang,
}: {
  gloss: string | null;
  glossLang?: string | null;
  pageLang?: string | undefined;
}) {
  return (
    <>
      {gloss ?? '—'}
      {gloss && glossLang && pageLang && glossLang !== pageLang && (
        <span className="ml-1 text-xs text-paper-400" aria-label={`in ${glossLang}`}>
          ({glossLang})
        </span>
      )}
    </>
  );
}
