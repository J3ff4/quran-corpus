import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SURAH_BAND_PATH, SURAH_BAND_VIEW_BOX } from '@quran-corpus/config/ornaments/surahBand';

import { useThemeColors } from '@/theme/themeContext';

/** 16320 / 2000, the art's own ratio. Stretching the band to fill a line box
 *  would distort the arabesque, so the band keeps its shape and the line box
 *  keeps its height. */
const BAND_ASPECT = 8.16;

export interface SurahBandProps {
  /** Transliterated, matching the reader's other headings.
   *
   *  The band takes the name and not the surah's id: web's `SurahFrame` puts
   *  numerals in the two medallion cutouts because it heads a scrolling
   *  surah, but on a mushaf page the number is already in the footer and the
   *  cutouts are 5dp wide at this band's height. */
  surahName: string;
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
 * The art carries no readable text -- the name is drawn over it -- so the band
 * publishes the name as its own accessibility label. Without that a screen
 * reader meets decorative art and a bare word.
 */
export function SurahBand({ surahName, height, width }: SurahBandProps) {
  const theme = useThemeColors();
  // Whichever axis runs out first. `meet` would letterbox the art for us, but
  // the name is drawn over the band and has to follow the height the band
  // actually got, not the box it was offered.
  const bandHeight = Math.min(height, width / BAND_ASPECT);
  const bandWidth = bandHeight * BAND_ASPECT;

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={surahName}
      style={{ height, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg
        width={bandWidth}
        height={bandHeight}
        viewBox={SURAH_BAND_VIEW_BOX}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: 'absolute' }}
      >
        <Path d={SURAH_BAND_PATH} fill={theme.mutedText} />
      </Svg>
      {/* Positioned by inset rather than padding, the trap web's SurahFrame
          documents: a percentage padding resolves against the container's
          WIDTH on both axes, which on an 8.16:1 box overshoots the height and
          pushes the name out below the band. */}
      <Text
        numberOfLines={1}
        style={{
          color: theme.text,
          fontSize: bandHeight * 0.42,
          textAlign: 'center',
        }}
      >
        {surahName}
      </Text>
    </View>
  );
}
