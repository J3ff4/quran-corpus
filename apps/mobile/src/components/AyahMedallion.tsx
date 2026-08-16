import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useThemeColors } from '@/theme/themeContext';

// Backing layer -- web's `fill-paper-50 dark:fill-night-100` path. Copied
// verbatim from apps/web/src/components/reader/ornaments/AyahMedallion.tsx.
const BACKING_PATH =
  "M59.46,118.91h0c-.86,0-1.68-.38-2.24-1.04-.09-.1-2.05-2.44-4.78-6.52-4.99-1.55-9.71-4.77-13.77-9.4h-18.79c-1.62,0-2.93-1.31-2.93-2.93v-18.79c-4.63-4.06-7.85-8.78-9.4-13.77-4.08-2.73-6.42-4.7-6.52-4.78-.66-.56-1.04-1.37-1.04-2.24s.38-1.68,1.04-2.24c.11-.09,2.44-2.05,6.52-4.78,1.55-4.99,4.77-9.71,9.4-13.77v-18.79c0-1.62,1.31-2.93,2.93-2.93h18.79c4.06-4.63,8.78-7.85,13.77-9.4,2.73-4.08,4.69-6.42,4.78-6.52.55-.66,1.37-1.04,2.24-1.04s1.68.38,2.24,1.04c.09.1,2.05,2.44,4.78,6.52,4.99,1.55,9.71,4.77,13.77,9.4h18.79c1.62,0,2.93,1.31,2.93,2.93v18.79c4.63,4.06,7.85,8.78,9.4,13.77,4.08,2.73,6.42,4.7,6.52,4.78.66.56,1.04,1.37,1.04,2.24s-.38,1.68-1.04,2.24c-.1.09-2.44,2.05-6.52,4.78-1.55,4.99-4.77,9.71-9.4,13.77v18.79c0,1.62-1.31,2.93-2.93,2.93h-18.79c-4.06,4.63-8.78,7.85-13.77,9.4-2.73,4.08-4.7,6.42-4.78,6.52-.56.66-1.37,1.04-2.24,1.04Z";
// Outline layer -- web's `fill-none stroke-current` path. Copied verbatim
// from apps/web/src/components/reader/ornaments/AyahMedallion.tsx.
const OUTLINE_PATH =
  "M22.81,96.1h17.22c.88,0,1.71.39,2.26,1.07,3.76,4.59,8.16,7.65,12.72,8.83.71.18,1.32.62,1.72,1.23,1.03,1.57,1.96,2.9,2.73,3.95.77-1.06,1.7-2.39,2.73-3.95.4-.61,1.01-1.05,1.72-1.23,4.56-1.18,8.96-4.23,12.72-8.83.55-.68,1.39-1.07,2.26-1.07h17.22v-17.22c0-.88.39-1.71,1.07-2.27,4.59-3.76,7.65-8.16,8.83-12.72.18-.71.62-1.32,1.23-1.72,1.57-1.03,2.89-1.96,3.95-2.73-1.06-.77-2.39-1.7-3.95-2.73-.61-.4-1.05-1.01-1.23-1.72-1.18-4.57-4.23-8.96-8.83-12.72-.68-.56-1.07-1.39-1.07-2.27v-17.22h-17.22c-.88,0-1.71-.39-2.26-1.07-3.76-4.59-8.16-7.65-12.72-8.83-.71-.18-1.32-.62-1.72-1.23-1.03-1.57-1.96-2.89-2.73-3.95-.77,1.06-1.7,2.39-2.73,3.95-.4.61-1.01,1.05-1.72,1.23-4.56,1.18-8.96,4.23-12.72,8.83-.55.68-1.39,1.07-2.26,1.07h-17.22v17.22c0,.88-.39,1.71-1.07,2.27-4.59,3.76-7.64,8.16-8.83,12.72-.18.71-.62,1.32-1.23,1.72-1.57,1.03-2.89,1.96-3.95,2.73,1.06.77,2.39,1.7,3.95,2.73.61.4,1.05,1.01,1.23,1.72,1.18,4.57,4.23,8.96,8.83,12.72.68.55,1.07,1.39,1.07,2.26v17.22Z";

/**
 * Ayah-marker rosette: the traditional mushaf 8-point notched star with the
 * verse number inside. Ported from web's ornament so both products draw the
 * same marker; the source art's cream fill and dark stroke are replaced by
 * theme tokens, per CLAUDE.md §8.
 */
export function AyahMedallion({ n, size = 28 }: { n: number; size?: number }) {
  const theme = useThemeColors();

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Ayah ${n}`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg
        width={size}
        height={size}
        viewBox="0 0 118.91 118.91"
        style={{ position: 'absolute' }}
      >
        <Path d={BACKING_PATH} fill={theme.surface} />
        <Path
          d={OUTLINE_PATH}
          fill="none"
          stroke={theme.mutedText}
          strokeWidth={4}
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={{ color: theme.mutedText, fontSize: Math.round(size * 0.38) }}>{n}</Text>
    </View>
  );
}
