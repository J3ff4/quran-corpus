import { useEffect, useRef, type ReactNode } from 'react';
import { BackHandler, Keyboard, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useGlassSkin } from '@/components/GlassSurface';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { centredContent } from '@/theme/contentWidth';
import { useStableInsets } from '@/theme/useStableInsets';
import { useThemeColors } from '@/theme/themeContext';
import { useWindowClass } from '@/theme/windowClass';

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
  /** How much room under the last row, where 16 is not right for this sheet.
   *  The word sheet asks for more (owner, 2026-09-11): its last row is a
   *  tappable link rather than a button, so it needs to read as finished
   *  rather than as cut off. The note sheet keeps 16 -- 24 under Save with the
   *  keyboard up is the dead space that got trimmed the day before. */
  bottomPadding?: number;
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
export function BottomSheet({ onClose, closeLabel, bottomPadding = 16, children }: BottomSheetProps) {
  const theme = useThemeColors();
  const skin = useGlassSkin();
  const reduced = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();
  // R9: a sheet that spans a 1400dp tablet reads as broken, not roomy -- at
  // the expanded window class it becomes a centred dialog instead. Medium
  // deliberately keeps the sheet: a 700dp window is not wide enough for a
  // dialog to read as anything but a sheet with margins.
  const isDialog = useWindowClass() === 'expanded';

  // Starts a full screen down so the first frame is off-screen, rather than the
  // sheet appearing in place and then sliding.
  const translateY = useSharedValue(screenHeight);
  const fade = useSharedValue(0);
  const sheetHeight = useSharedValue(0);
  // How far the sheet has to rise to clear the keyboard.
  //
  // Read from RN's own Keyboard events, NOT from reanimated's
  // `useAnimatedKeyboard`, which was the first attempt and did nothing on the
  // device (owner, 2026-09-10: "text area is still behind the keyboard").
  // Reanimated attaches its listener to `currentActivity.window.decorView` and
  // only updates the height once a WindowInsetsAnimation callback on THAT view
  // has moved its state to OPEN. This sheet lives in a <Modal>, which is a
  // separate native window: the IME animation is dispatched to the dialog's
  // window, the activity's decor view never sees it, and the height stays 0
  // for as long as the sheet is open. RN's own events read the static ime
  // inset off the root window instead, with no animation callback to miss.
  //
  // Plus the bottom inset: `keyboardDidShow` reports the ime inset MINUS the
  // system bars (ReactRootView.checkForKeyboardEvents), and this sheet is
  // anchored at bottom: 0 of an edge-to-edge window -- i.e. behind the
  // navigation bar, which the keyboard also covers. Without the inset the
  // sheet stops a navigation bar short and its last row stays buried.
  const keyboardLift = useSharedValue(0);
  // Stable, not live: the mushaf hides the navigation bar with its chrome,
  // which collapses the live inset to 0 -- so a sheet already open lost this
  // padding, got shorter, and its top edge slid down mid-read (owner, device,
  // 2026-09-22). The hook holds the last non-zero inset, which is the one that
  // was there when the sheet opened (ruling R3).
  const bottomInset = useStableInsets().bottom;

  useEffect(() => {
    // Seeded from the metrics rather than starting at 0: a sheet opened while
    // the keyboard is ALREADY up never receives a `didShow`, so it would sit
    // under the keyboard for its whole life. No animation for this one -- the
    // keyboard is not moving, so there is nothing to ride.
    const open = Keyboard.metrics();
    if (open) keyboardLift.value = open.height + bottomInset;

    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      const to = event.endCoordinates.height + bottomInset;
      keyboardLift.value = reduced ? to : withTiming(to, ENTER);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardLift.value = reduced ? 0 : withTiming(0, EXIT);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [bottomInset, keyboardLift, reduced]);

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
    // Drag-to-dismiss is meaningless on a centred card -- there is no edge to
    // drag toward -- so it is disabled at expanded, same as under reduced
    // motion. The GestureDetector below is also unmounted entirely at
    // expanded; this belt-and-braces the case where it isn't.
    .enabled(!reduced && !isDialog)
    .onUpdate((event) => {
      // Downward only: dragging up would lift the sheet off the bottom edge
      // and open a gap onto the backdrop.
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const height = sheetHeight.value || screenHeight;
      if (event.translationY > height * DISMISS_FRACTION || event.velocityY > DISMISS_VELOCITY) {
        fade.value = withTiming(0, { duration: FADE_MS });
        // Plus the lift: the sheet's visible offset is `translateY -
        // keyboardLift`, so travelling only to `height` with the keyboard up
        // leaves it a keyboard's worth still on screen when onClose unmounts
        // it -- a pop instead of a slide.
        translateY.value = withTiming(height + keyboardLift.value, EXIT, (finished?: boolean) => {
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
  const sheetStyle = useAnimatedStyle(() => {
    if (isDialog) {
      // Scale + fade, not a slide -- there is no bottom edge to slide up
      // from. Driven off `fade`, the same value the sheet's own entrance
      // already animates: no second shared value to keep in sync. Under
      // reduced motion, opacity only, per the same rule as the sheet.
      return {
        opacity: fade.value,
        transform: [{ scale: reduced ? 1 : 0.92 + fade.value * 0.08 }],
      };
    }
    return {
      // Under reduced motion the sheet fades with the backdrop and never
      // moves; otherwise it is opaque throughout and only translates.
      opacity: reduced ? fade.value : 1,
      // Minus the keyboard, so the sheet sits ON its top edge rather than
      // under it. Subtracted from the same value the entrance and the drag
      // write, so a sheet dragged down with the keyboard up still lands
      // where it should and a keyboard opening mid-entrance does not fight
      // the slide.
      transform: [{ translateY: translateY.value - keyboardLift.value }],
    };
  });

  // The dialog clears the keyboard by shrinking the box it is centred in, not
  // by moving the card. Translating a centred card up by a full keyboard's
  // height pushes a tall one's top edge off the screen; padding the container
  // cannot, because the card is still centred in whatever is left.
  //
  // Same `keyboardLift` the sheet path uses, for the same reason: this lives
  // in a <Modal>, where `useAnimatedKeyboard` reads 0 forever (see the comment
  // on keyboardLift). The owner hit exactly that bug on the sheet path --
  // 2026-09-10, "text area is still behind the keyboard" -- and the note sheet
  // is a dialog at expanded, so shipping this branch without a lift recreates
  // it on a tablet. With the keyboard closed the lift is 0 and this is inert.
  const dialogLiftStyle = useAnimatedStyle(() => ({
    paddingBottom: isDialog ? keyboardLift.value : 0,
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
      {/* No <NavigationBar hidden /> here any more (owner, 2026-09-16).
          Hiding it collapsed `insets.bottom` to 0 for as long as a sheet was
          open, and everything docked off the tab bar is positioned from that
          inset -- so opening the reciter picker dropped the player behind the
          sheet and closing it put the player back, which is the dip the owner
          kept seeing on the mushaf. The buttons-on-the-last-row problem this
          was fixing is handled by padding the sheet past the inset instead,
          which is the thing that was actually wrong. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View
          testID="sheet-container"
          style={[
            StyleSheet.absoluteFill,
            // Below expanded the surface positions itself (`position:
            // absolute, bottom: 0`) and this is inert. At expanded the
            // surface is a normal flow child, centred by its parent.
            { justifyContent: isDialog ? 'center' : 'flex-end' },
            dialogLiftStyle,
          ]}
          pointerEvents="box-none"
        >
      <AnimatedPressable
        testID="sheet-backdrop"
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.4)' }, backdropStyle]}
      />
      {(() => {
        const surface = (
          <Animated.View
            role="dialog"
            aria-modal
            testID="sheet-surface"
            onLayout={(event: LayoutChangeEvent) => {
              sheetHeight.value = event.nativeEvent.layout.height;
            }}
            style={[
              isDialog
                ? {
                    // A centred card, not a sheet: all four corners, no
                    // bottom inset to clear (nothing is docked against a
                    // system bar), and 520 rather than 640 because a dialog
                    // wants to read as an object on the screen, not as a
                    // column of the page.
                    alignSelf: 'center',
                    width: '100%',
                    maxWidth: 520,
                    backgroundColor: theme.surface,
                    borderRadius: 28,
                    paddingHorizontal: 20,
                    paddingTop: 20,
                    // Symmetric by default, but `bottomPadding` still wins
                    // when it asks for more: the word sheet passes 24 to keep
                    // its last row off the edge, and a dialog that silently
                    // ignored it would be the only surface in the app where
                    // that prop does nothing. No `bottomInset` here -- a
                    // centred card is not docked against a system bar.
                    paddingBottom: Math.max(bottomPadding, 20),
                    gap: 14,
                    // Android draws only `elevation`, not the shadow* props
                    // -- reuses the same card shadow every other surface in
                    // the app lifts off the page with.
                    ...skin.shadow,
                  }
                : {
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: theme.surface,
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                    paddingHorizontal: 20,
                    // Owner, 2026-09-10, on the device: "remove these big padding on
                    // top word sheet. and note has both top and bottom big padding."
                    // The handle's own marginBottom is gone with it: the column's
                    // `gap` already separates it from the first row, so the two were
                    // stacking to 34dp under a 4dp bar. 8 + handle + gap puts the
                    // first row 26dp down, half of the 50 it was, and the 28 below
                    // was dead space under Save with the keyboard up.
                    paddingTop: 8,
                    // Past the navigation bar, not under it. The sheet is
                    // anchored at bottom: 0 of an edge-to-edge window, so on a
                    // three-button device the buttons sat ON its last row (owner, on
                    // an S24, 2026-09-15).
                    paddingBottom: bottomPadding + bottomInset,
                    gap: 14,
                  },
              sheetStyle,
            ]}
          >
            {!isDialog && (
              // Hidden at expanded: the handle advertises a drag, and the
              // dialog has no drag to advertise.
              <View
                testID="sheet-handle"
                style={{
                  alignSelf: 'center',
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: theme.border,
                }}
              />
            )}
            <View
              testID="sheet-content"
              // The surface stays full-bleed -- it is the bottom edge of the
              // window -- but its rows do not. Every scene in the app is capped
              // by `centredContent` on the navigator's sceneStyle, and a sheet
              // lives in a <Modal>, outside that navigator, so it was the one
              // surface still pinned to both edges: on the Tab S10+ in landscape
              // (1400dp, 2026-09-28) the word sheet's `Full analysis` row ran
              // 1360dp with its chevron marooned at the far edge. Same pattern
              // as GlassTabBar: full-bleed bar, centred column inside it.
              style={{ ...centredContent, gap: 14 }}
            >
              {children}
            </View>
          </Animated.View>
        );
        // Drag-to-dismiss only exists for the sheet: a dialog has no edge to
        // drag toward, so it mounts no GestureDetector at all rather than one
        // that is merely disabled.
        return isDialog ? surface : <GestureDetector gesture={pan}>{surface}</GestureDetector>;
      })()}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
