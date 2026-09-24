import { useMemo, type ReactNode } from 'react';
import { Text } from 'react-native';
import { alignAyahTokens, splitAyahRunTokens, type Word } from '@quran-corpus/data/mobile';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

export interface AyahTextProps {
  textUthmani: string;
  /** The ayah's word rows, read at press time and for TalkBack labels -- never
   *  for the run's structure. Returns an empty array until they are fetched. */
  getWords: () => Word[];
  surahId: number;
  ayahNumber: number;
  onWordPress: (word: Word) => void;
  /** Rendered inside the run, after the last word -- mushaf mode's ayah
   *  medallion. Inside rather than beside: only one text run gets native
   *  Arabic line breaking, so a marker in a sibling View sits at the end of
   *  the *block*, not at the end of the text, and a one-line ayah then shows
   *  its marker a full line below the words it closes. */
  trailing?: ReactNode;
}

/**
 * The ayah's Uthmani text with each word a tap target.
 *
 * Tokenizes `text_uthmani` rather than rendering the `words` rows, because the
 * rows drop the waqf pause marks and carry nothing for the basmala that
 * prefixes ayah 1 -- see alignAyahTokens. The reading surface shows the mushaf
 * text; the word rows only supply what happens on a tap.
 *
 * **The run's structure does not depend on the word rows, and that is
 * load-bearing.** It used to: no words meant one flat `<Text>`, words meant N
 * nested `<Text>` spans, and the prefetch flipped a card from one to the other
 * as the reader scrolled past it. Android re-records a RenderNode whole rather
 * than the visible slice, so that flip cost 18.7ms inside a 29.3ms frame on
 * 2:282 -- a card 2467dp tall with 128 spans -- and the owner felt it as a
 * stutter on exactly the long ayahs (device measurement, 2026-09-22/23).
 * Drawing the spans from `splitAyahRunTokens` from the first paint means the
 * tree never changes shape and the card is recorded once. Anything added here
 * that reads the word rows during render puts that stutter back.
 *
 * **Every child of the run costs, and the cost is per FRAGMENT, not per
 * character.** Fabric serialises this run as an attributed string and
 * `ReactTextViewManager.updateState` rebuilds the Spannable from it on the UI
 * thread, as part of the mount, inside a scroll frame. Measured on the device
 * (atrace, 20 scrolls through al-Baqara's tail, three repeats, 2026-09-23):
 * the same 2:282 card drawn as one flat `<Text>` costs 0.4-0.9ms there; drawn
 * as one `<Text>` per word it costs 13.0 / 15.9 / 16.1ms, against an 11.1ms
 * budget at 90Hz. Text volume is not the driver -- the flat run carries every
 * one of those characters. So keep the child count down: a token is ONE string
 * child, never a separator child plus a text child, which doubled it.
 *
 * The basmala banner is NOT rendered here. It belongs above the whole ayah 1
 * card as the surah's opening (owner ruling 2026-08-17: inside the card it
 * still reads as part of ayah 1), so SurahReader owns it. What this owes that
 * banner is the other half of the split: ayah 1's run never contains the
 * basmala, so the two can never disagree about whether it was taken out.
 */
export function AyahText({
  textUthmani,
  getWords,
  surahId,
  ayahNumber,
  onWordPress,
  trailing,
}: AyahTextProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();
  const tokens = useMemo(
    () => splitAyahRunTokens(textUthmani, { surahId, ayahNumber }),
    [textUthmani, surahId, ayahNumber],
  );

  // Read during render for TalkBack labels only, and deliberately not a
  // dependency of the run above: when the rows land while this card is
  // mounted the labels go stale until something else re-renders it, and a
  // re-render here is the stutter. SurahReader keeps the map in state instead
  // while a screen reader is running, which is when the labels matter.
  const words = getWords();

  const labels = useMemo(
    () =>
      words.length > 0 ? alignedWords(textUthmani, words, surahId, ayahNumber, tokens.length) : null,
    [textUthmani, words, surahId, ayahNumber, tokens.length],
  );

  const style = {
    color: theme.text,
    fontFamily: 'Hafs',
    fontSize: sizes.reader,
    textAlign: 'right' as const,
    // textAlign aligns the block. writingDirection is a no-op on Android --
    // RN 0.86 consumes it only on iOS (no reference to it anywhere under
    // ReactAndroid/ or textlayoutmanager/platform/android), and Android
    // resolves paragraph direction from the content instead, via
    // TextDirectionHeuristics.FIRSTSTRONG_LTR. Arabic is first-strong RTL, so
    // markers, digits and punctuation come out right regardless; it is kept
    // for iOS parity and for text that does not start with a strong character.
    // Do NOT add it expecting it to fix an Android bidi bug.
    writingDirection: 'rtl' as const,
  };

  return (
    /* Nested <Text>, not a flexWrap row of Views: only one text run gets
       native Arabic line breaking and justified mushaf flow. */
    <Text testID="ayah-run" style={style}>
      {tokens.map((token, index) => {
        const word = labels?.[index] ?? null;
        // The split dropped the whitespace; without this the ayah renders as
        // one unbroken string. Concatenated into ONE string rather than left
        // as a sibling child: two children of a <Text> are two fragments of
        // the attributed string, and Fabric's cost here is per fragment --
        // see the note on this component above.
        const text = index === 0 ? token.text : ` ${token.text}`;
        return (
          <Text
            key={index}
            testID={token.isMark ? 'mark-token' : 'word-token'}
            accessibilityRole={token.isMark ? undefined : 'button'}
            // Transliteration first: TalkBack in a non-Arabic UI locale reads
            // the Arabic run character by character. Falls back to the token
            // itself before the rows have landed.
            accessibilityLabel={word?.transliteration ?? word?.text_arabic ?? token.text}
            onPress={
              token.isMark
                ? undefined
                : () => {
                    // getWords(), not the `words` read above: the rows land
                    // without re-rendering this card, so a snapshot taken in
                    // render is stale for exactly the tap this exists to
                    // serve -- the first one after a prefetch returns.
                    const rows = getWords();
                    if (rows.length === 0) return;
                    const word = alignedWords(
                      textUthmani,
                      rows,
                      surahId,
                      ayahNumber,
                      tokens.length,
                    )?.[index];
                    if (word) onWordPress(word);
                  }
            }
          >
            {text}
          </Text>
        );
      })}
      {trailing}
    </Text>
  );
}

/**
 * The word row behind each token the run renders, positionally.
 *
 * The basmala tokens are filtered out on both sides -- the run never draws
 * them -- so the result indexes straight off the rendered token list. Null
 * when the rows and the text cannot be reconciled; the run still draws, it
 * just has nothing to open.
 *
 * `runTokenCount` is what makes that indexing safe rather than assumed. The
 * two halves of the split decide the basmala differently -- the run
 * positionally, `alignAyahTokens` by token arithmetic against the word count
 * -- and they agree on all 6,236 ayahs of the shipped corpus but are not the
 * same test. Should they ever disagree, one side drops four tokens the other
 * keeps and every label and every tap lands four words off, silently, which is
 * worse than no word detail at all. So the lengths are checked and the whole
 * alignment fails closed, exactly as `alignAyahTokens` already does when it
 * cannot reconcile the rows itself.
 */
function alignedWords(
  textUthmani: string,
  words: Word[],
  surahId: number,
  ayahNumber: number,
  runTokenCount: number,
): Array<Word | null> | null {
  const aligned = alignAyahTokens(
    textUthmani,
    words.map((word) => word.text_arabic),
    { surahId, ayahNumber },
  );
  if (!aligned) return null;
  const drawn = aligned
    .filter((token) => !token.isBasmala)
    .map((token) => (token.wordIndex === null ? null : (words[token.wordIndex] ?? null)));
  return drawn.length === runTokenCount ? drawn : null;
}
