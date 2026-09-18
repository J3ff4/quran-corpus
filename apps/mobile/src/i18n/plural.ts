import type { UiLocaleCode } from './languages';

/** The three categories this app's locales need. CLDR defines six; Uzbek uses
 *  one of them, English two, Russian three, and nothing here counts fractions,
 *  so the other three would be dead branches. */
export type PluralCategory = 'one' | 'few' | 'many';

/**
 * Which form of a counted noun `n` takes in `locale`.
 *
 * Hand-written rather than `Intl.PluralRules` on purpose: nothing in this app
 * touches `Intl` today, and Hermes ships it only when the build enables ICU --
 * a header that renders on every Bookmarks open is the wrong place to discover
 * it is absent on a device. The three rules below are small and total.
 */
export function pluralCategory(locale: UiLocaleCode, n: number): PluralCategory {
  const count = Math.abs(Math.trunc(n));

  if (locale === 'ru') {
    // The usual Slavic three-way, and the exception is the whole point: the
    // teens all take `many` however they end, so 11 goes with 111 and not with
    // 1, and 12-14 go with 5 and not with 2. An `=== 1` branch bolted onto
    // English gets every one of those wrong.
    const lastTwo = count % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return 'many';
    const last = count % 10;
    if (last === 1) return 'one';
    if (last >= 2 && last <= 4) return 'few';
    return 'many';
  }

  // Uzbek takes no agreement after a numeral -- `1 oyat` and `5 oyat` are both
  // right -- so it answers 'one' and its three forms are the same string.
  if (locale === 'uz') return 'one';

  // English: singular at exactly 1, plural everywhere else including 0.
  return count === 1 ? 'one' : 'many';
}
