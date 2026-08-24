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
export function Bloom() {
  const theme = useThemeColors();
  const isDark = theme.background === themeColors.dark.background;
  const wash = isDark ? bloom.dark : bloom.light;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="bloom" cx={wash.cx} cy={wash.cy} rx={wash.rx} ry={wash.ry}>
            {wash.stops.map((stop, index) => (
              <Stop key={stop} offset={index === 0 ? '0' : '1'} stopColor={stop} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bloom)" />
      </Svg>
    </View>
  );
}
