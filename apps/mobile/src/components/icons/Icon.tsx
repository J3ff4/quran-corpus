import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type IconName = 'home' | 'book' | 'bookmark' | 'settings';

/**
 * Path data ported verbatim from web so the two products draw one glyph set:
 * home / book from apps/web/src/components/shell/BottomNav.tsx, bookmark from
 * DrawerMenu.tsx. `settings` has no web counterpart -- the web drawer has no
 * settings entry -- so it is drawn here.
 *
 * RN has no currentColor, so the stroke arrives as a prop from the theme.
 */
const PATHS: Record<IconName, string[]> = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5'],
  book: [
    'M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2z',
    'M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2z',
  ],
  bookmark: ['M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1z'],
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4z',
  ],
};

export function Icon({
  name,
  color,
  size = 24,
}: {
  name: IconName;
  color: ColorValue;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}
