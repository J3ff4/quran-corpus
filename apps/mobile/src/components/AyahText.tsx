import { useMemo } from 'react';
import { Text } from 'react-native';
import { alignAyahTokens, splitBasmala, type Word } from '@quran-corpus/data/mobile';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

export interface AyahTextProps {
  textUthmani: string;
  /** Empty means "not loaded yet", not "this ayah has no words". */
  words: Word[];
  surahId: number;
  ayahNumber: number;
  onWordPress: (word: Word) => void;
}

/**
 * The ayah's Uthmani text with each word a tap target.
 *
 * Tokenizes `text_uthmani` rather than rendering the `words` rows, because the
 * rows drop the waqf pause marks and carry nothing for the basmala that
 * prefixes ayah 1 -- see alignAyahTokens. The reading surface shows the mushaf
 * text; the word rows only supply what happens on a tap.
 *
 * The basmala banner is NOT rendered here. It belongs above the whole ayah 1
 * card as the surah's opening (owner ruling 2026-08-17: inside the card it
 * still reads as part of ayah 1), so SurahReader owns it. What this owes that
 * banner is the other half of the split: ayah 1's run never contains the
 * basmala, on the aligned path or the fallback, so the two can never disagree
 * about whether it was taken out.
 */
export function AyahText({ textUthmani, words, surahId, ayahNumber, onWordPress }: AyahTextProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();
  const tokens = useMemo(
    () =>
      words.length > 0
        ? alignAyahTokens(
            textUthmani,
            words.map((word) => word.text_arabic),
            { surahId, ayahNumber },
          )
        : null,
    // `words`, not `words.length` -- the memo reads text_arabic, so a
    // same-length array with corrected text would otherwise reuse stale
    // tokens. apps/mobile has no eslint-plugin-react-hooks, so nothing would
    // flag it.
    [textUthmani, words, surahId, ayahNumber],
  );

  const style = {
    color: theme.text,
    fontFamily: 'Hafs',
    fontSize: sizes.reader,
    textAlign: 'right' as const,
    // textAlign only aligns the block. writingDirection drives the bidi
    // resolution, which orders markers, digits and punctuation correctly
    // inside the Arabic run on Android.
    writingDirection: 'rtl' as const,
  };

  // No words yet, or an ayah alignAyahTokens could not reconcile. Either way
  // the reader shows the complete Uthmani text; only the tap targets are
  // missing, which is the right thing to lose. The basmala still comes off:
  // the banner above the card does not wait for the words to load, so leaving
  // the prefix in here printed it twice on the first paint of every surah but
  // 1 and 9.
  if (!tokens) {
    return <Text style={style}>{splitBasmala(textUthmani, { surahId, ayahNumber }).rest}</Text>;
  }

  return (
    <>
      {/* Nested <Text>, not a flexWrap row of Views: only one text run gets
          native Arabic line breaking and justified mushaf flow. */}
      <Text testID="ayah-run" style={style}>
        {tokens.map((token, index) => {
          // Taken out of the run because the banner above prints it. Filtered
          // here and not in the memo so `index` still lines up with the token
          // list the alignment produced.
          if (token.isBasmala) return null;
          const word = token.wordIndex === null ? null : words[token.wordIndex];
          // The split dropped the whitespace; without this the ayah renders as
          // one unbroken string.
          const separator = index === 0 || tokens[index - 1]?.isBasmala ? '' : ' ';
          if (!word) {
            return (
              <Text key={index}>
                {separator}
                {token.text}
              </Text>
            );
          }
          return (
            <Text
              key={index}
              testID="word-token"
              accessibilityRole="button"
              // Transliteration first: TalkBack in a non-Arabic UI locale reads
              // the Arabic run character by character.
              accessibilityLabel={word.transliteration ?? word.text_arabic}
              onPress={() => onWordPress(word)}
            >
              {separator}
              {token.text}
            </Text>
          );
        })}
      </Text>
    </>
  );
}
