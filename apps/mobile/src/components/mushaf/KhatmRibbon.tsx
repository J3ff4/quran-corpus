import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '@/theme/themeContext';

/** How far above its resting place the ribbon starts, in dp. */
const DROP = 24;
/** Long enough to read as silk falling, short enough to stay feedback for a
 *  tap. Matches the chrome's own 220ms travel, so a mark made from the bar
 *  settles with it. */
const DROP_MS = 220;
/** The retract. Longer than the drop because it covers more than twice the
 *  distance -- at 220ms the same travel reads as a flick, not a pull. */
const RETRACT_MS = 280;

/** The ribbon's width. Narrow: it is a marker, not a banner. */
const WIDTH = 14;
/** Its length past the page's top edge, notch included. */
const LENGTH = 56;
/** The bite out of the tail. A notch, not a point -- a bookmark ribbon is cut,
 *  not sharpened. */
const NOTCH = 7;

/** Where the silk sits, in dp from its resting place, and how opaque. */
export interface KhatmRibbonFrame {
  offset: number;
  fade: number;
}

/** A ribbon that has not been marked yet: above its rest, and invisible, so
 *  the first mark FALLS into place rather than appearing already there. */
export const KHATM_RIBBON_HIDDEN: KhatmRibbonFrame = { offset: -DROP, fade: 0 };

/**
 * Where the silk travels to, and over how long.
 *
 * The two directions are deliberately not mirror images, which is the whole
 * reason this is a function and not one interpolated progress value:
 *
 * - Marking DROPS it the last 24dp into place, fading in as it goes.
 * - Lifting RETRACTS it its whole 56dp length, so the tail disappears under
 *   the page's top edge -- the ribbon is pulled out of the book rather than
 *   evaporating off the paper (owner, 2026-10-03). `fade` therefore stays at
 *   1 on the way out: a ribbon that faded as it slid would read as both at
 *   once and as neither clearly.
 *
 * Pure and exported because the Reanimated test shim resolves `withTiming`
 * straight to its target, so a rendered component only ever shows the settled
 * frame -- the SHAPE of either move is unassertable through the component and
 * has to be stated here to be testable at all.
 *
 * NOT workletized, and it must not be called from one. It is read in an effect
 * on the JS thread, which is where `withTiming` is issued from; the style
 * worklet below reads the two shared values and calls nothing. That is on
 * purpose -- the previous version of this file called an imported helper from
 * inside `useAnimatedStyle`, and a plain function is not callable on the UI
 * thread at all: reanimated throws rather than hopping threads, and the throw
 * took the whole screen down (device, vc88 -- opening the mushaf tab crashed
 * the app outright). No imported call in the worklet, no way back to that bug.
 */
export function khatmRibbonTarget(marked: boolean): KhatmRibbonFrame & { duration: number } {
  return marked
    ? { offset: 0, fade: 1, duration: DROP_MS }
    : { offset: -LENGTH, fade: 1, duration: RETRACT_MS };
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
 * furniture on the one surface this design treats as paper. It does stay drawn
 * for the 280ms a lift takes, because a view unmounted in the same render that
 * clears the mark takes its own exit animation with it -- which is exactly
 * what the first version did, and why lifting a mark looked like the ribbon
 * blinking out of existence.
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

  // Drawn, which is not the same as marked: it stays true through the retract.
  // Mirrored in a ref so the effect below can ask "was anything on screen?"
  // without taking the state as a dependency -- with it in the deps the enter
  // branch would re-issue its own animation the moment it set the state.
  const [drawn, setDrawn] = useState(marked);
  const drawnRef = useRef(marked);
  const draw = useCallback((next: boolean) => {
    drawnRef.current = next;
    setDrawn(next);
  }, []);

  // Seeded from the prop, so arriving at an already-marked page shows the
  // ribbon at rest instead of re-dropping it on every page turn. The drop is
  // feedback for the tap, not an entrance.
  const settled = khatmRibbonTarget(true);
  const offset = useSharedValue(marked ? settled.offset : KHATM_RIBBON_HIDDEN.offset);
  const fade = useSharedValue(marked ? settled.fade : KHATM_RIBBON_HIDDEN.fade);

  // Driven from an effect, NOT `withTiming` inside the style worklet. In the
  // worklet it is re-issued every time the worklet re-evaluates -- which is
  // every render of this page, and the mushaf re-renders on every turn, press
  // and recitation tick -- so each re-issue restarts the curve from wherever
  // the ribbon had got to. Same reasoning as MushafChrome's own bar.
  useEffect(() => {
    const target = khatmRibbonTarget(marked);
    if (marked) {
      // Back to the hidden seed first, for the mark that follows a lift: the
      // retract leaves the silk a whole length above its rest, and animating
      // from there would drop it 56dp instead of the 24 the drop is specified
      // as. Only when nothing is drawn -- a re-mark mid-retract has silk on
      // screen, and snapping it up before dropping it is a visible flinch.
      if (!drawnRef.current) {
        offset.value = KHATM_RIBBON_HIDDEN.offset;
        fade.value = KHATM_RIBBON_HIDDEN.fade;
      }
      draw(true);
      if (reduceMotion) {
        offset.value = target.offset;
        fade.value = target.fade;
        return;
      }
      offset.value = withTiming(target.offset, { duration: target.duration });
      fade.value = withTiming(target.fade, { duration: target.duration });
      return;
    }
    // Nothing on screen to take off it. This is the common case by far -- the
    // pager keeps three pages mounted and turns through 604 of them, so every
    // page but one runs this branch on mount -- and without the guard each one
    // would issue an animation and a callback into a view that was never drawn.
    if (!drawnRef.current) return;
    if (reduceMotion) {
      // A standing instruction not to animate (CLAUDE.md §8). The mark goes at
      // once, which is the trade this setting asks for.
      draw(false);
      return;
    }
    offset.value = withTiming(
      target.offset,
      { duration: target.duration, easing: Easing.in(Easing.cubic) },
      (finished?: boolean) => {
        // Only on a settled retract: an interrupted one -- the page unmounting
        // under it, or the reader re-marking mid-pull -- must not go on to
        // unmount silk that is on its way back in.
        if (finished) runOnJS(draw)(false);
      },
    );
  }, [marked, reduceMotion, offset, fade, draw]);

  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: offset.value }],
  }));

  if (!drawn) return null;

  return (
    // The clip is what makes the retract read as going UNDER the page's edge
    // rather than sliding up over the strip above it. Its height is the
    // ribbon's own length, so a silk pulled a full length up is entirely
    // hidden -- and the drop emerges from the same edge on the way in.
    <View
      testID="khatm-ribbon"
      // It must not eat the tap that toggles the chrome: the page's Pressable
      // is an ANCESTOR, so a touch this view claimed would never reach it.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: WIDTH,
        height: LENGTH,
        overflow: 'hidden',
        alignItems: 'center',
      }}
    >
      <Animated.View
        testID="khatm-ribbon-silk"
        style={[
          { width: WIDTH, alignItems: 'center' },
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
    </View>
  );
}
