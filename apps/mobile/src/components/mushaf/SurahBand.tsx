import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  SURAH_BAND_CARTOUCHE,
  SURAH_BAND_MEDALLIONS,
  SURAH_BAND_NUMERAL_SIZE,
  SURAH_BAND_PATH,
  SURAH_BAND_VIEW_BOX,
  toEasternArabicNumeral,
} from '@quran-corpus/config/ornaments/surahBand';
import {
  needsSurahNameFallback,
  surahNameGlyph,
} from '@quran-corpus/config/ornaments/surahName';

import { fonts } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** 16320 / 2000, the art's own ratio. Stretching the band to fill a line box
 *  would distort the arabesque, so the band keeps its shape and the line box
 *  keeps its height. */
const BAND_ASPECT = 8.16;

export interface SurahBandProps {
  /** Transliterated, matching the reader's other headings. */
  surahName: string;
  /** Filled into the two medallion cutouts -- Eastern Arabic-Indic on the
   *  right, Western on the left (M7d ruling 10), which is the same pairing
   *  web's SurahFrame draws. */
  surahId: number;
  /** The line box this band sits in. */
  height: number;
  /** The column the line box sits in. The band is 8.16:1, and a line box tall
   *  enough makes that wider than the page: at a 15-line grid on a 360dp
   *  screen the box is ~50dp, which asks for a 411dp band inside a 328dp
   *  column and cuts both ends of the arabesque off. The band fits the
   *  narrower of the two and keeps its shape. */
  width: number;
}

/**
 * The arabesque banner that opens a surah on a mushaf page (ruling 21): our own
 * `Sura_border`, the same art web's `SurahFrame` draws, rather than KFGQPC's
 * surah-name font.
 *
 * The name is written INSIDE the cartouche, in the calligraphic surah-name face
 * web's reader header already uses -- one PUA glyph per surah, which is a piece
 * of calligraphy and not a line of type. It used to be the transliteration,
 * printed underneath the band: a frame with an empty panel over a Latin caption,
 * which is neither what a mushaf does nor what the art is shaped for.
 *
 * Nothing in the band is readable to a screen reader -- the art carries no text
 * and the glyph is a private-use codepoint -- so the band publishes the
 * transliterated name as its own accessibility label.
 */
export function SurahBand({ surahName, surahId, height, width }: SurahBandProps) {
  const theme = useThemeColors();
  // Whichever axis runs out first. `meet` would letterbox the art for us, but
  // the name is drawn over the band and has to follow the height the band
  // actually got, not the box it was offered.
  const bandHeight = Math.min(height, width / BAND_ASPECT);
  const bandWidth = bandHeight * BAND_ASPECT;
  const digits = String(surahId).length;
  const medallion = {
    position: 'absolute' as const,
    top: bandHeight * SURAH_BAND_MEDALLIONS.top,
    width: bandWidth * SURAH_BAND_MEDALLIONS.width,
    height: bandHeight * SURAH_BAND_MEDALLIONS.height,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={surahName}
      style={{ height, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: bandWidth, height: bandHeight, justifyContent: 'center' }}>
        <Svg
          width={bandWidth}
          height={bandHeight}
          viewBox={SURAH_BAND_VIEW_BOX}
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute' }}
        >
          <Path d={SURAH_BAND_PATH} fill={theme.mutedText} />
        </Svg>
        {/* Both cutouts carry the number, in the two scripts (ruling 10). The
            band already announces the surah by name, so these are decoration
            to a screen reader -- read aloud they would be the same fact twice,
            in two alphabets.

            A View per medallion with the Text inside it, not the box styles on
            the Text itself: `alignItems`/`justifyContent` are flex CONTAINER
            properties and a <Text> is not one, so set on the Text they did
            nothing and both numerals sat high and left of the cutout they are
            supposed to be centred in. */}
        <View
          testID="band-numeral-eastern"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ ...medallion, left: bandWidth * SURAH_BAND_MEDALLIONS.easternLeft }}
        >
          <Text
            style={{
              color: theme.text,
              fontSize:
                bandHeight *
                (digits === 3
                  ? SURAH_BAND_NUMERAL_SIZE.easternLong
                  : SURAH_BAND_NUMERAL_SIZE.easternShort),
              textAlign: 'center',
              // The glyph box is taller than the digits, and a line box left to
              // Android's own metrics puts them off centre by the difference.
              lineHeight: bandHeight * SURAH_BAND_MEDALLIONS.height,
            }}
          >
            {toEasternArabicNumeral(surahId)}
          </Text>
        </View>
        <View
          testID="band-numeral-western"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ ...medallion, left: bandWidth * SURAH_BAND_MEDALLIONS.westernLeft }}
        >
          <Text
            style={{
              color: theme.text,
              fontSize:
                bandHeight *
                (digits <= 2
                  ? SURAH_BAND_NUMERAL_SIZE.westernShort
                  : SURAH_BAND_NUMERAL_SIZE.westernLong),
              textAlign: 'center',
              lineHeight: bandHeight * SURAH_BAND_MEDALLIONS.height,
              fontVariant: ['tabular-nums'],
            }}
          >
            {surahId}
          </Text>
        </View>

        {/* The name, inside the cartouche the two medallions flank. */}
        <View
          testID="band-name"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: 0,
            height: bandHeight,
            left: bandWidth * SURAH_BAND_CARTOUCHE.left,
            width: bandWidth * SURAH_BAND_CARTOUCHE.width,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: needsSurahNameFallback(surahId) ? fonts.surahNameAlt : fonts.surahName,
              color: theme.text,
              fontSize: bandHeight * SURAH_BAND_CARTOUCHE.nameSize,
              lineHeight: bandHeight,
              textAlign: 'center',
            }}
          >
            {surahNameGlyph(surahId)}
          </Text>
        </View>
      </View>
    </View>
  );
}
