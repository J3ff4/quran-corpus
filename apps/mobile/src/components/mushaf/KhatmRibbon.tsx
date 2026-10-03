import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useThemeColors } from '@/theme/themeContext';

/** How far above its resting place the ribbon starts, in dp. */
const DROP = 24;
/** Long enough to read as silk falling, short enough to stay feedback for a
 *  tap. Matches the chrome's own 220ms travel, so a mark made from the bar
 *  settles with it. */
const DROP_MS = 220;

/** The ribbon's width. Narrow: it is a marker, not a banner. */
const WIDTH = 14;
/** Its length past the page's top edge, notch included. */
const LENGTH = 56;
/** The bite out of the tail. A notch, not a point -- a bookmark ribbon is cut,
 *  not sharpened. */
const NOTCH = 7;

/**
 * translateY for the drop, in dp: above its rest at 0, settled at 1.
 *
 * Pure and exported because the Reanimated test shim resolves `withTiming`
 * straight to its target, so a rendered component only ever shows the settled
 * frame. The SHAPE of the drop -- that it falls DOWN into place rather than
 * rising into it -- is unassertable through the component and has to be stated
 * here to be testable at all.
 */
export function khatmRibbonTranslateY(progress: number): number {
  return (progress - 1) * DROP;
}

export interface KhatmRibbonProps {
  marked: boolean;
  reduceMotion: boolean;
}

/**
 * The khatm ribbon, hanging in the marked page's top corner.
 *
 * Draws nothing at all when the page is not the marked one (R-C2): paper is
 * clean at rest, and a faint stub on each of the 604 pages is 604 pieces of
 * furniture on the one surface this design treats as paper.
 *
 * **Top LEFT, which is the leading corner and not the spine.** A mushaf opens
 * right to left, so a physical ribbon hangs top-right. The owner asked for the
 * left (R-C7) and this is a deliberate override -- do not "fix" it.
 *
 * Decoration, deliberately invisible to TalkBack: the chrome button says
 * "Lift the mark" in words, and a second node here would only repeat it. Note
 * that `accessible` is NOT the prop for that -- it hides a view's children
 * from TalkBack, which no unit test in this repo can see.
 */
export function KhatmRibbon({ marked, reduceMotion }: KhatmRibbonProps) {
  const theme = useThemeColors();

  // Seeded from the prop, so arriving at an already-marked page shows the
  // ribbon at rest instead of re-dropping it on every page turn. The drop is
  // feedback for the tap, not an entrance.
  const progress = useSharedValue(marked ? 1 : 0);
  // Driven from an effect, NOT `withTiming` inside the style worklet. In the
  // worklet it is re-issued every time the worklet re-evaluates -- which is
  // every render of this page, and the mushaf re-renders on every turn, press
  // and recitation tick -- so each re-issue restarts the curve from wherever
  // the ribbon had got to. Same reasoning as MushafChrome's own bar.
  useEffect(() => {
    const target = marked ? 1 : 0;
    progress.value = reduceMotion ? target : withTiming(target, { duration: DROP_MS });
  }, [marked, reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: khatmRibbonTranslateY(progress.value) }],
  }));

  if (!marked) return null;

  return (
    <Animated.View
      testID="khatm-ribbon"
      // It must not eat the tap that toggles the chrome: the page's Pressable
      // is an ANCESTOR, so a touch this view claimed would never reach it.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { position: 'absolute', top: 0, left: 0, width: WIDTH, alignItems: 'center' },
        // Under reduced motion the ribbon simply IS there -- no transform, no
        // fade (CLAUDE.md §8). The mark is the function; the drop is the
        // flourish.
        reduceMotion ? null : style,
      ]}
    >
      <Animated.View style={{ width: WIDTH, height: LENGTH - NOTCH, backgroundColor: theme.ribbon }} />
      {/* The notch. Two triangles from borders, not an SVG: a zero-sized box
          whose left and right borders are the ribbon colour and whose bottom
          border is transparent draws exactly the V a cut ribbon has. No native
          module, and nothing for the page's hardware layer to rasterise beyond
          the two it already holds. */}
      <Animated.View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: WIDTH / 2,
          borderRightWidth: WIDTH / 2,
          borderBottomWidth: NOTCH,
          borderLeftColor: theme.ribbon,
          borderRightColor: theme.ribbon,
          borderBottomColor: 'transparent',
        }}
      />
    </Animated.View>
  );
}
