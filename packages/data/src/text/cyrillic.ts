/**
 * Cyrillic romanized letter by letter, in the transcription these names
 * already use.
 *
 * `surahName.ts` reduces both sides of a comparison to `[a-z0-9]`, which is
 * the right fold for the Latin spellings the corpus was built on and silently
 * fatal for anything else: a Cyrillic name folds to the empty string and
 * matches nothing. Once `surah_names` carried Russian rows that stopped being
 * theoretical -- `Бакара` found no surah, and neither did `бакара`, in a UI
 * whose every surah name was Cyrillic (#96 device run). The 114 `uz-Cyrl` rows
 * had been broken the same way since the day they landed.
 *
 * Romanizing here rather than adding a parallel Cyrillic comparison keeps ONE
 * answer to "does this name that surah": the article rules, the Uzbek `o`
 * readings and the trailing-h rule all still apply, to a Russian query as much
 * as an English one.
 *
 * Pure string work, no imports: safe for the client and mobile entry points.
 */

/** Russian, plus the Uzbek Cyrillic letters the `uz-Cyrl` names need: `қ` -> `q`
 *  is what makes `Бақара` and `Baqarah` the same name.
 *
 *  `ь` and `ъ` map to nothing on purpose -- they are not sounds a reader
 *  types, and keeping them would leave a character the Latin fold then strips
 *  anyway. */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h', ҷ: 'j', ӣ: 'i', ӯ: 'u',
};

/**
 * Every Cyrillic letter replaced by its Latin reading; everything else
 * untouched.
 *
 * Applied to a stored name and to a query by the same caller, so it cannot
 * improve one side into something the other cannot reach. NFC first, because
 * only a composed string can be compared to another: a decomposed `ё`
 * (`е` + U+0308) is not the `ё` in the table, and that mismatch is exactly how
 * 49 form chips died once.
 *
 * A letter outside the table is dropped rather than kept. Keeping it would
 * leave a character the Latin fold strips one line later, which is the same
 * outcome by a longer route.
 */
export function romanizeCyrillic(raw: string): string {
  return raw.normalize('NFC').replace(/[Ѐ-ӿ]/g, (ch) => {
    const mapped = CYRILLIC_TO_LATIN[ch.toLowerCase()];
    return mapped ?? '';
  });
}

/** True when `raw` holds a Cyrillic letter. The callers use it to keep the
 *  romanization off the path of every Latin name they already handle. */
export function hasCyrillic(raw: string): boolean {
  return /[Ѐ-ӿ]/.test(raw);
}
