import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { glass, radii, themeColors } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface GlassSurfaceProps {
  children: ReactNode;
  /** card (20) by default; pill (28) for docked bars and the tab pill. */
  radius?: keyof typeof radii;
  /** Extra layout style. Colour and border are the component's own. */
  style?: StyleProp<ViewStyle>;
  /**
   * True for a bar docked over scrolling content.
   *
   * RN has no backdrop-filter, so the translucent fill is simply see-through:
   * on the recitation bar (device, 2026-08-25) and on every tab screen
   * (device, 2026-08-29) the ayah behind the bar read straight through its
   * labels. A docked surface therefore paints an opaque backing over the fill.
   * Both bars used to carry that backing themselves, both at `opacity: 0.94`,
   * which left 6% of the page still bleeding through -- the rule lives here so
   * the next docked bar cannot be copy-pasted wrong again.
   */
  docked?: boolean;
  /**
   * Paint this instead of the translucent glass fill.
   *
   * Instead of, never behind: the fill is 85% opaque, so a colour laid under it
   * arrives washed out by the exact amount that makes a measured contrast
   * figure a lie. The alphabet tile and the filter chip avoid the problem by
   * painting the glass recipe themselves; a card that needs a ground takes this
   * instead of forking a third copy.
   */
  tint?: string | undefined;
  /**
   * No drop shadow at all.
   *
   * For a surface inside a clip. PlayerShell's box is `overflow: hidden`, and
   * a clipped shadow is worse than no shadow: it stops at the box edge, so
   * where the surface's corner curves away the shadow stays square and a hard
   * grey wedge sits in each bottom corner (owner, on the device, 2026-09-16).
   * Home's listen card cannot buy the shadow room back -- the room is what
   * made it narrower than every other card on the tab -- so it gives up the
   * shadow instead.
   */
  flat?: boolean;
  testID?: string;
}

/**
 * The fill, hairline, highlight and shadow this theme's glass is made of.
 *
 * Exported because a few surfaces cannot be a <GlassSurface>: the alphabet
 * tile and the filter chip are Pressables whose own background has to swap to
 * the accent wash when selected, and wrapping each in a surface would put a
 * translucent fill *behind* the wash -- the one thing the wash's measured
 * contrast figures forbid. They take the recipe and paint it themselves rather
 * than re-deriving `isDark` in three places.
 */
export function useGlassSkin() {
  const theme = useThemeColors();
  return theme.background === themeColors.dark.background ? glass.dark : glass.light;
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
 * two themes, and two variants -- `docked`, a fact about where the surface
 * sits, and `tint`, a fact about what state it is in. Add another when a screen
 * actually needs it; `tint` arrived when the reader's playing ayah did.
 */
export function GlassSurface({
  children,
  radius = 'card',
  style,
  testID,
  tint,
  docked = false,
  flat = false,
}: GlassSurfaceProps) {
  const skin = useGlassSkin();
  const theme = useThemeColors();

  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: tint ?? skin.fill,
          borderColor: skin.border,
          borderWidth: 1,
          borderRadius: radii[radius],
          overflow: 'hidden',
          ...(flat ? {} : docked ? skin.dockedShadow : skin.shadow),
        },
        style,
      ]}
    >
      {docked ? (
        <View
          testID={testID ? `${testID}-backing` : undefined}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}
        />
      ) : null}
      {/* The tint again, over the opaque backing rather than under it. The
          fill set on the view itself is covered by that backing, so without
          this a docked surface would silently ignore `tint` -- and the
          backing cannot simply BE the tint, since a tint is translucent by
          design and the whole job of a docked backing is to be opaque. */}
      {docked && tint ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      ) : null}
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
