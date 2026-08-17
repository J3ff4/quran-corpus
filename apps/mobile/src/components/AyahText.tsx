import { useMemo } from 'react';
import { Text } from 'react-native';
import { alignAyahTokens, type Word } from '@quran-corpus/data/mobile';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

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
 */
export function AyahText({ textUthmani, words, surahId, ayahNumber, onWordPress }: AyahTextProps) {
  const theme = useThemeColors();
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
    fontSize: typography.arabicReader,
    textAlign: 'right' as const,
    // textAlign only aligns the block. writingDirection drives the bidi
    // resolution, which orders markers, digits and punctuation correctly
    // inside the Arabic run on Android.
    writingDirection: 'rtl' as const,
  };

  // No words yet, or an ayah alignAyahTokens could not reconcile. Either way
  // the reader shows the complete Uthmani text; only the tap targets are
  // missing, which is the right thing to lose.
  if (!tokens) return <Text style={style}>{textUthmani}</Text>;

  return (
    // Nested <Text>, not a flexWrap row of Views: only one text run gets
    // native Arabic line breaking and justified mushaf flow.
    <Text testID="ayah-run" style={style}>
      {tokens.map((token, index) => {
        // Rendered as its own banner above the card (see Bismillah), so the
        // run drops it rather than printing it a second time. Filtered here
        // and not in the memo so `index` still lines up with the token list
        // the alignment produced.
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
  );
}
