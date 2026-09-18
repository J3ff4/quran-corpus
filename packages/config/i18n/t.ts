import type { UiLocaleCode } from './locales';

/** Build a lookup over one app's own string table.
 *
 *  The MECHANISM is shared; the TABLE is not. Web and mobile have different
 *  chrome (mobile has tabs.* and mushaf.*, web has neither), so one shared
 *  table would make each app carry the other's keys and every missing
 *  translation would be a missing key in the other app.
 */
export function makeT<K extends string>(
  table: Record<UiLocaleCode, Record<K, string>>,
): (locale: UiLocaleCode, key: K) => string {
  return (locale, key) => table[locale][key];
}
