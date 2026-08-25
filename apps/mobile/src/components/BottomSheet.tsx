import { useEffect, useRef, type ReactNode } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { useThemeColors } from '@/theme/themeContext';

// No spring. Owner ruling 2026-08-17, after the third device run: "i dont like
// that spring. just regular movement is fine." Two prior passes tried to tune
// it -- web's ported 28/320, then a critically damped 46/520 -- and neither
// landed, so the physics is gone rather than retuned a third time. Web's
// WordPopover keeps its own spring; the divergence is deliberate, the same way
// the accent colour diverges in theme/tokens.ts. Do not port a spring back in.
//
// Decelerating in, accelerating out: the sheet arrives under control and
// leaves without lingering. Durations are Android's own sheet range.
const ENTER = { duration: 220, easing: Easing.out(Easing.cubic) } as const;
const EXIT = { duration: 180, easing: Easing.in(Easing.cubic) } as const;
const FADE_MS = 150;
// Fractions of the sheet's own height and dp/s, matching Android's own sheets:
// a short flick dismisses without having to drag the whole way down.
const DISMISS_FRACTION = 0.25;
const DISMISS_VELOCITY = 500;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface BottomSheetProps {
  /** Dismissal. The sheet does not animate out on unmount -- see the reset
   *  effect -- so the caller unmounting it IS the close. */
  onClose: () => void;
  /** Accessible name for the backdrop, which is otherwise an unlabelled
   *  full-screen button to TalkBack. */
  closeLabel: string;
  children: ReactNode;
}

/**
 * The sheet shell: dim backdrop, slide-up entrance, drag-to-dismiss, Android
 * back. Mounting it opens it; unmounting closes it. Extracted from WordSheet so
 * the language sheet does not duplicate any of it (CLAUDE.md §3).
 *
 * Inside a <Modal>, which is the only way it can cover the floating tab pill:
 * the pill is the navigator's `tabBar`, a sibling of the whole screen, so
 * anything a screen renders paints under it however it is positioned or
 * z-indexed. On the device the word sheet's Root row came out behind the pill,
 * and the pill stayed tappable over the dimmed backdrop (owner report,
 * 2026-08-25). A Modal renders in its own native window above the navigator,
 * so the backdrop dims the pill too and swallows its taps -- which is what an
 * Android system sheet does.
 */
export function BottomSheet({ onClose, closeLabel, children }: BottomSheetProps) {
  const theme = useThemeColors();
  const reduced = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();

  // Starts a full screen down so the first frame is off-screen, rather than the
  // sheet appearing in place and then sliding.
  const translateY = useSharedValue(screenHeight);
  const fade = useSharedValue(0);
  const sheetHeight = useSharedValue(0);

  // Read through a ref so the entrance effect below does not depend on it.
  // With screenHeight in those deps, an Android split-screen resize while the
  // sheet is open re-runs the entrance: the sheet snaps a full screen down and
  // slides back in, mid-read. Synced in an effect declared first, so it has
  // committed before the entrance effect runs on the same pass.
  const screenHeightRef = useRef(screenHeight);
  useEffect(() => {
    screenHeightRef.current = screenHeight;
  }, [screenHeight]);

  useEffect(() => {
    if (reduced) {
      translateY.value = 0;
      fade.value = withTiming(1, { duration: FADE_MS });
    } else {
      translateY.value = screenHeightRef.current;
      translateY.value = withTiming(0, ENTER);
      fade.value = withTiming(1, { duration: FADE_MS });
    }
  }, [reduced, translateY, fade]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      // Swallow it. Falling through dismisses the sheet AND pops the screen
      // underneath, so one back tap would lose the user's place.
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  const pan = Gesture.Pan()
    .enabled(!reduced)
    .onUpdate((event) => {
      // Downward only: dragging up would lift the sheet off the bottom edge
      // and open a gap onto the backdrop.
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const height = sheetHeight.value || screenHeight;
      if (event.translationY > height * DISMISS_FRACTION || event.velocityY > DISMISS_VELOCITY) {
        fade.value = withTiming(0, { duration: FADE_MS });
        translateY.value = withTiming(height, EXIT, (finished?: boolean) => {
          // Only on a settled animation: unmounting mid-flight leaves the
          // sheet half-way down for the frame before it disappears.
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withTiming(0, ENTER);
        // Restored, not left alone: a dismiss interrupted by a second pan never
        // reaches its `finished` callback, so onClose never runs and `fade` is
        // still on its way to 0. Sliding the sheet back without it leaves it
        // fully visible over an undimmed screen, with an invisible backdrop
        // still swallowing taps.
        fade.value = withTiming(1, { duration: FADE_MS });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    // Under reduced motion the sheet fades with the backdrop and never moves;
    // otherwise it is opaque throughout and only translates.
    opacity: reduced ? fade.value : 1,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      transparent
      visible
      // We animate the sheet ourselves, in the effect above.
      animationType="none"
      // Without it the backdrop stops at the status bar and the sheet sits
      // under a bright strip.
      statusBarTranslucent
      // Android routes the back press to the topmost Modal, so the
      // BackHandler subscription above no longer sees it. Both are kept: the
      // subscription is what covers the sheet's own dismissal path, and this
      // is what covers back while the Modal window has focus.
      onRequestClose={onClose}
    >
      {/* RNGH needs its own root inside a Modal: the one in app/_layout.tsx
          belongs to the main window, and gestures in this window are not
          routed through it, so drag-to-dismiss dies silently on Android. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <AnimatedPressable
        testID="sheet-backdrop"
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.4)' }, backdropStyle]}
      />
      <GestureDetector gesture={pan}>
        <Animated.View
          role="dialog"
          aria-modal
          onLayout={(event: LayoutChangeEvent) => {
            sheetHeight.value = event.nativeEvent.layout.height;
          }}
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.surface,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 28,
              gap: 14,
            },
            sheetStyle,
          ]}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.border,
              marginBottom: 20,
            }}
          />
          {children}
        </Animated.View>
        </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
