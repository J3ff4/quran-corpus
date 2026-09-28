import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { bloom } from '@/theme/tokens';
import { useIsDarkTheme, useThemeColors } from '@/theme/themeContext';

/**
 * The radial wash the whole app sits on.
 *
 * One instance, mounted behind the navigator in app/_layout.tsx and repainted
 * only when the window itself changes size -- a per-screen copy would repaint
 * a full-screen gradient on every navigation, which is the frame budget the
 * mid-range target does not have. It is pointerEvents="none" so it cannot eat a touch.
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
  const isDark = useIsDarkTheme();
  const wash = isDark ? bloom.dark : bloom.light;

  // The gradient is placed in real pixels rather than per-axis percentages:
  // percentages let the viewport's aspect ratio reshape the ellipse, which on
  // a wide screen collapsed the wash into a left-hugging band with bare ground
  // beside it (see the `bloom` token's note). Radii come off the diagonal so
  // the wash is the same shape at every aspect ratio.
  const { width, height } = useWindowDimensions();
  const diagonal = Math.hypot(width, height);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient
            id="bloom"
            gradientUnits="userSpaceOnUse"
            cx={width * wash.cx}
            cy={height * wash.cy}
            rx={diagonal * wash.rx}
            ry={diagonal * wash.ry}
          >
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
