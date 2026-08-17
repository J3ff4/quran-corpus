import { useEffect, useRef } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { Word } from '@quran-corpus/data/mobile';
import type { WordSummary } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { SegmentedWord } from './SegmentedWord';
import { SegmentPill } from './SegmentPill';

// NOT web's WordPopover spring any more. Owner ruling 2026-08-16, after the M3
// device run: web keeps its bounce, mobile softens. The port comment that used
// to sit here said "do not retune one of them alone" -- that is now explicitly
// overridden for this value, the same way the accent colour diverges in
// theme/tokens.ts. Do not "fix" this back to web's numbers.
//
// reanimated's withSpring defaults mass 1, so the damping ratio is
// damping / (2 * sqrt(stiffness)). 28/320 gave 0.78 -- underdamped, and the
// overshoot is what read as jumpy on a 120 Hz panel.
const SPRING = { damping: 38, stiffness: 320 } as const;

/** Exported for the test: RN's animation internals are not observable from
 *  jsdom, so the physics is asserted at the parameter instead of the frames. */
export const SPRING_DAMPING_RATIO = SPRING.damping / (2 * Math.sqrt(SPRING.stiffness));
const FADE_MS = 150;
// Fractions of the sheet's own height and dp/s, matching Android's own sheets:
// a short flick dismisses without having to drag the whole way down.
const DISMISS_FRACTION = 0.25;
const DISMISS_VELOCITY = 500;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const actionStyle = {
  minHeight: touchTargets.minimum,
  justifyContent: 'center',
} as const;

export interface WordSheetProps {
  /** null closes the sheet -- see the unmount note in the reset effect. */
  summary: WordSummary | null;
  uiLocale: UiLocaleCode;
  onClose: () => void;
  onOpenDetail: (word: Word) => void;
  onOpenRoot: (rootBuckwalter: string) => void;
}

/**
 * The word morphology sheet: the tapped word's Arabic, its gloss, one pill per
 * morphological segment, and the two ways deeper into the corpus.
 */
export function WordSheet({ summary, uiLocale, onClose, onOpenDetail, onOpenRoot }: WordSheetProps) {
  const theme = useThemeColors();
  const reduced = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();
  const open = summary !== null;

  // Starts a full screen down so the first frame after `summary` arrives is
  // off-screen, rather than the sheet appearing in place and then sliding.
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
    if (!open) {
      // Reset rather than animate out: the sheet unmounts the moment `summary`
      // goes null -- keeping it mounted would leave a full-screen backdrop
      // swallowing every tap in the reader -- so there is no view left to run
      // an exit on. This puts the next open back off-screen.
      translateY.value = screenHeightRef.current;
      fade.value = 0;
      return;
    }
    if (reduced) {
      translateY.value = 0;
      fade.value = withTiming(1, { duration: FADE_MS });
    } else {
      translateY.value = screenHeightRef.current;
      translateY.value = withSpring(0, SPRING);
      fade.value = withSpring(1, SPRING);
    }
  }, [open, reduced, translateY, fade]);

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      // Swallow it. Falling through dismisses the sheet AND pops the reader,
      // so one back tap would lose the user's place in the surah.
      return true;
    });
    return () => subscription.remove();
  }, [open, onClose]);

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
        fade.value = withSpring(0, SPRING);
        translateY.value = withSpring(height, SPRING, (finished?: boolean) => {
          // Only on a settled animation: unmounting mid-flight leaves the
          // sheet half-way down for the frame before it disappears.
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, SPRING);
        // Restored, not left alone: a dismiss whose spring is interrupted by a
        // second pan never reaches its `finished` callback, so onClose never
        // runs and `fade` is still on its way to 0. Springing the sheet back
        // without it leaves it fully visible over an undimmed reader, with an
        // invisible backdrop still swallowing taps.
        fade.value = withSpring(1, SPRING);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    // Under reduced motion the sheet fades with the backdrop and never moves;
    // otherwise it is opaque throughout and only translates.
    opacity: reduced ? fade.value : 1,
    transform: [{ translateY: translateY.value }],
  }));

  if (!summary) return null;

  const { word, segments, gloss } = summary;
  const rootBuckwalter = word.root_buckwalter;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <AnimatedPressable
        testID="sheet-backdrop"
        accessibilityRole="button"
        // The backdrop is the only dismiss control, so it needs a name: to
        // TalkBack it is otherwise an unlabelled full-screen button.
        accessibilityLabel={t(uiLocale, 'word.close')}
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
          <SegmentedWord word={word} segments={segments} fontSize={typography.arabicTitle} />
          <Text
            style={{ color: gloss ? theme.text : theme.mutedText, fontSize: typography.body }}
          >
            {gloss ?? t(uiLocale, 'word.noGloss')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {segments.map((segment) => (
              <SegmentPill key={segment.id} segment={segment} />
            ))}
          </View>
          <Pressable
            testID="full-analysis"
            accessibilityRole="button"
            onPress={() => onOpenDetail(word)}
            style={actionStyle}
          >
            <Text style={{ color: theme.accent, fontSize: typography.body }}>
              {t(uiLocale, 'word.fullAnalysis')}
            </Text>
          </Pressable>
          {rootBuckwalter ? (
            <Pressable
              testID="root-link"
              accessibilityRole="button"
              onPress={() => onOpenRoot(rootBuckwalter)}
              style={actionStyle}
            >
              <Text style={{ color: theme.accent, fontSize: typography.body }}>
                {/* Buckwalter is the routing key; the Arabic is only the label,
                    and some rows carry no Arabic root at all. */}
                {`${t(uiLocale, 'word.root')} ${word.root ?? rootBuckwalter}`}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
