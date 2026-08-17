/**
 * Aligns an ayah's Uthmani text to its `words` rows.
 *
 * Concatenating `words.text_arabic` does NOT reproduce `ayahs.text_uthmani`:
 * the word rows drop waqf pause marks, drop the rub-el-hizb marker, and carry
 * no rows at all for the basmala that prefixes ayah 1 of most surahs. So the
 * reader tokenizes the Uthmani text -- which is the text a reader must see --
 * and attaches word metadata by index, rather than rendering the word rows and
 * silently deleting the marks. Validated against all 6,236 ayahs on
 * 2026-08-16: 6,236 aligned, 0 failures.
 */

/** Standalone Quranic annotation marks: small high/low waqf signs (U+06D6-DC),
 *  end-of-ayah (U+06DD), rub-el-hizb (U+06DE), sajdah (U+06E9). Each is a
 *  space-separated token in `text_uthmani` and has no `words` row. */
const STANDALONE_MARK = /^[ۖ-۞۩]+$/u;

/** Token count of the basmala as it appears prefixed to ayah 1. */
const BASMALA_TOKENS = 4;

export interface AyahToken {
  /** Uthmani text exactly as it appears, including any merged trailing mark. */
  text: string;
  /** 0-based index into the ayah's position-ordered word list, or null for
   *  text with no word row. */
  wordIndex: number | null;
  /** True on the tokens of the basmala that prefixes ayah 1 of most surahs.
   *  They carry no word row, and a reader that shows the basmala as its own
   *  banner needs to drop them from the ayah's run -- which it cannot decide
   *  for itself, because `hasBasmala` below is settled by token arithmetic
   *  that has to run after the mark merge. */
  isBasmala?: true;
}

/**
 * @param wordTexts the ayah's `words.text_arabic` in `position` order. Passed
 *   rather than a bare count because one word row -- 37:130's `إِلْ يَاسِينَ`,
 *   the only one in the corpus -- contains a space and therefore spans two
 *   whitespace-separated tokens of `text_uthmani`. Counting rows would make
 *   that ayah the single alignment failure in the whole Quran.
 */
export function alignAyahTokens(
  textUthmani: string,
  wordTexts: readonly string[],
  ref: { surahId: number; ayahNumber: number },
): AyahToken[] | null {
  // How many whitespace-separated tokens each word row occupies. Almost always
  // 1; see the note on wordTexts above.
  const spans = wordTexts.map((text) => text.trim().split(/\s+/).filter(Boolean).length || 1);
  const tokenCount = spans.reduce((sum, span) => sum + span, 0);

  const raw = textUthmani.replace(/\uFEFF/g, '').split(/\s+/).filter(Boolean);

  // Leading marks have nothing to attach backwards to, so they stand alone.
  const leading: AyahToken[] = [];
  let i = 0;
  while (i < raw.length && STANDALONE_MARK.test(raw[i]!)) {
    leading.push({ text: raw[i]!, wordIndex: null });
    i += 1;
  }

  // Every remaining mark attaches to the word it follows. Left standing alone
  // it would be counted as a word and offset every index after it.
  const merged: string[] = [];
  for (; i < raw.length; i += 1) {
    const token = raw[i]!;
    if (STANDALONE_MARK.test(token) && merged.length > 0) {
      merged[merged.length - 1] += ` ${token}`;
    } else {
      merged.push(token);
    }
  }

  // Must run AFTER the merge. Checked before it, an ayah 1 that also carries a
  // waqf mark has more raw tokens than tokenCount + 4, so its basmala goes
  // undetected and the ayah falls back to the unaligned blob -- that scores
  // 99.50% across the corpus instead of 100%.
  //
  // al-Fatiha's ayah 1 IS the basmala (four real words) and at-Tawba has none,
  // so both are exempt.
  const hasBasmala =
    ref.ayahNumber === 1 &&
    ref.surahId !== 1 &&
    ref.surahId !== 9 &&
    merged.length === tokenCount + BASMALA_TOKENS;
  const offset = hasBasmala ? BASMALA_TOKENS : 0;

  // A partial alignment attaches one word's morphology to a different word,
  // which is worse than showing none. Fail closed; the caller renders the raw
  // string.
  if (merged.length - offset !== tokenCount) return null;

  // Walk the spans so a word occupying two tokens claims both of them.
  const aligned: AyahToken[] = [];
  let wordIndex = 0;
  let remaining = spans[0] ?? 0;
  for (const [index, text] of merged.entries()) {
    if (index < offset) {
      aligned.push({ text, wordIndex: null, isBasmala: true });
      continue;
    }
    aligned.push({ text, wordIndex });
    remaining -= 1;
    if (remaining === 0) {
      wordIndex += 1;
      remaining = spans[wordIndex] ?? 0;
    }
  }

  return [...leading, ...aligned];
}
