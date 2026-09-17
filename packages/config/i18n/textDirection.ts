/**
 * Which way a piece of user-written text runs.
 *
 * Only user text needs this. Everything the app itself writes is either Quranic
 * Arabic (hard-coded RTL, see AyahText) or a UI string in the interface locale,
 * and all three interface locales are LTR. A note is the one string in the app
 * the reader types themselves, in whatever language they like -- and a note in
 * Arabic rendered flush-left reads as a layout bug even though the glyphs
 * themselves shape correctly (device, 2026-08-29).
 *
 * First-strong, as the Unicode bidi algorithm resolves a paragraph: skip
 * neutrals (digits, punctuation, spaces) and take the direction of the first
 * character that has one. A note that opens with "2:255 " and continues in
 * Arabic is an Arabic note.
 */
const FIRST_STRONG_RTL =
  /^[^\p{Letter}]*[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u;

export function isRtlText(text: string): boolean {
  return FIRST_STRONG_RTL.test(text);
}

/** `textAlign` for a block of user text. `writingDirection` is iOS-only on RN
 *  (see AyahText), so alignment is what actually moves the block on Android. */
export function textAlignFor(text: string): 'left' | 'right' {
  return isRtlText(text) ? 'right' : 'left';
}
