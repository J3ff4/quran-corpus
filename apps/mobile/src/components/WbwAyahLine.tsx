import { Fragment } from 'react';
import { Text } from 'react-native';
import type { WbwPage } from '@/data/corpusRepository';
import { useArabicSizes } from '@/theme/useArabicSizes';
import { useThemeColors } from '@/theme/themeContext';

import { SegmentedWord } from './SegmentedWord';

/**
 * The whole ayah as one continuous Arabic line, each word in its POS colours.
 *
 * This is the "hybrid" half of mockup 2c -- it is what 2d drops and what the
 * old word grid never had: the verse still reads as a verse.
 *
 * Display only. Every word below is a real 48dp Pressable, and making the line
 * tappable too would put two accessibility nodes on every word.
 */
export function WbwAyahLine({ page }: { page: WbwPage }) {
  const sizes = useArabicSizes();
  const theme = useThemeColors();

  return (
    // One outer <Text>: Android gives native line breaking to a single text
    // run, so the line has to be one block. Nesting per WORD is safe -- words
    // are separated by a space, which breaks the shaping run anyway. Nesting
    // per SEGMENT is not, which is what SegmentedWord exists to handle
    // (decision 28).
    <Text
      testID="wbw-ayah-line"
      style={{
        color: theme.text,
        fontFamily: 'Hafs',
        fontSize: sizes.reader,
        // 2.3, as the mockup sets it: the line carries diacritics above and
        // below every word and sets tight at the reader's own leading.
        lineHeight: Math.round(sizes.reader * 2.3),
        textAlign: 'right',
        // textAlign places the block; writingDirection is iOS-only (see
        // AyahText). Android resolves direction from the content.
        writingDirection: 'rtl',
      }}
    >
      {page.words.map((word, index) => (
        <Fragment key={word.id}>
          {index > 0 ? ' ' : null}
          <SegmentedWord
            word={word}
            segments={page.segments.get(word.id) ?? []}
            fontSize={sizes.reader}
          />
        </Fragment>
      ))}
    </Text>
  );
}
