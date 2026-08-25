import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { bloom, themeColors } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/**
 * The radial wash the whole app sits on.
 *
 * One instance, mounted behind the navigator in app/_layout.tsx and never
 * re-rendered -- a per-screen copy would repaint a full-screen gradient on
 * every navigation, which is the frame budget the mid-range target does not
 * have. It is pointerEvents="none" so it cannot eat a touch.
 *
 * SVG rather than a stack of translucent Views: RN has no CSS gradient, and
 * faking a radial one with concentric views bands visibly. react-native-svg was
 * already a dependency (Icon draws through it).
 */
/**
 * Split `rgba(r, g, b, a)` into the two props react-native-svg actually reads.
 *
 * `stopColor` takes a colour and nothing else: an alpha channel inside it is
 * dropped, silently and on device only. The wash then renders as a flat sheet
 * of undiluted accent over every screen, which is what shipped -- the screens'
 * own opaque backgrounds hid it until they came off.
 */
function stopParts(stop: string): { color: string; opacity: number } {
  const match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(stop);
  if (!match) return { color: stop, opacity: 1 };
  return { color: `rgb(${match[1]}, ${match[2]}, ${match[3]})`, opacity: Number(match[4]) };
}

export function Bloom() {
  const theme = useThemeColors();
  const isDark = theme.background === themeColors.dark.background;
  const wash = isDark ? bloom.dark : bloom.light;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="bloom" cx={wash.cx} cy={wash.cy} rx={wash.rx} ry={wash.ry}>
            {wash.stops.map((stop, index) => {
              const { color, opacity } = stopParts(stop);
              return (
                <Stop
                  key={stop}
                  offset={index === 0 ? '0' : '1'}
                  stopColor={color}
                  stopOpacity={opacity}
                />
              );
            })}
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bloom)" />
      </Svg>
    </View>
  );
}
