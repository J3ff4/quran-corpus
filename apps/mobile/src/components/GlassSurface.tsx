import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { glass, radii, themeColors } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface GlassSurfaceProps {
  children: ReactNode;
  /** card (20) by default; pill (28) for docked bars and the tab pill. */
  radius?: keyof typeof radii;
  /** Extra layout style. Colour and border are the component's own. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A card, bar or sheet made of fake glass: translucent fill, hairline border,
 * inset top highlight, drop shadow.
 *
 * The highlight is a 1px absolutely-positioned child rather than a
 * borderTopColor, because RN's Android renderer drops the shadow entirely once
 * the four border sides differ -- and the shadow is what separates the card
 * from the bloom.
 *
 * ponytail: no blur variant, no elevation prop, no "intensity". One surface,
 * two themes. Add a variant when a screen actually needs a second one.
 */
export function GlassSurface({ children, radius = 'card', style, testID }: GlassSurfaceProps) {
  const theme = useThemeColors();
  const isDark = theme.background === themeColors.dark.background;
  const skin = isDark ? glass.dark : glass.light;

  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: skin.fill,
          borderColor: skin.border,
          borderWidth: 1,
          borderRadius: radii[radius],
          overflow: 'hidden',
          ...skin.shadow,
        },
        style,
      ]}
    >
      <View
        testID={testID ? `${testID}-highlight` : undefined}
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: skin.highlight,
        }}
      />
      {children}
    </View>
  );
}
