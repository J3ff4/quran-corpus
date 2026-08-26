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
      {children}
      {/* After the children, not before them. The recitation bar puts an opaque
          backing over the translucent fill (RN has no backdrop-filter), and as
          the first child that backing painted straight over this rim -- the one
          docked surface in the app lost the top edge every other one has. A 1px
          inset line is what the children are lit BY; nothing renders content
          under it. */}
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
    </View>
  );
}
