import { useEffect, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { GlassSurface } from '@/components/GlassSurface';
import { RecitationBar } from '@/components/RecitationBar';
import { Icon } from '@/components/icons/Icon';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useChromeVisible } from '@/mushaf/chromeVisibility';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** Matches `GlassTabBar` and `MushafChrome`, so the whole chrome leaves together. */
const CHROME_FADE_MS = 220;
/** Far enough to clear the player, the tab pill under it and both insets. */
const BAR_TRAVEL = 220;
/** The grow. Shorter than the chrome fade: this one happens under the thumb
 *  that pressed play, and anything slower reads as lag rather than motion. */
const GROW_MS = 180;
/**
 * Room around the clipped box for the surface's own drop shadow.
 *
 * The grow is a height animation, so the box has to clip -- and a clip tight
 * to the bar would shave the shadow that separates it from the page for as
 * long as the player is on screen, not only while it moves. The content is
 * inset by this much and the box is pushed down by it, so the bar lands in
 * exactly the same place it would with no clip at all.
 */
const SHADOW_ROOM = 16;

export interface MushafPlayerProps {
  /** Sound is coming out. The ONLY thing that picks compact vs full. A bar
   *  keyed on `ayahNumber` instead would never shrink: the parked ayah
   *  survives a pause on purpose, so resume knows where to go. */
  playing: boolean;
  /** Parked ayah, for the full bar's label. Null before the first play. */
  ayahNumber: number | null;
  positionSec: number;
  /** NaN until the track reports one. */
  durationSec: number;
  reciterLabel: string;
  uiLocale: UiLocaleCode;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  onSeek: (sec: number) => void;
  onOpenReciters: () => void;
  /** Where the tab pill's top edge is, so the player docks above it. Measured
   *  by the screen: the tab bar's height is not exported, and a constant here
   *  would drift the first time its padding changes. */
  bottomOffset: number;
}

/**
 * The mushaf's recitation player: one line at rest, the reader's full
 * transport while it sounds.
 *
 * Two states rather than the reader's one, because the mushaf has nowhere else
 * to start from. The reader plays from a control on each ayah card; a mushaf
 * page is 15 lines of glyphs with no per-ayah furniture at all, so without a
 * resting bar there is no way to begin. It stays one line so it costs the page
 * as little height as a control can.
 *
 * It hides with the rest of the chrome (owner, 2026-09-12) -- header, tab bar
 * and player on one rule, so the page can be read clean. That is what makes
 * the green ink on the sounding ayah load-bearing: once the chrome is down it
 * is the only thing left saying anything is playing.
 */
export function MushafPlayer({
  playing,
  ayahNumber,
  positionSec,
  durationSec,
  reciterLabel,
  uiLocale,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  onSeek,
  onOpenReciters,
  bottomOffset,
}: MushafPlayerProps) {
  const theme = useThemeColors();
  const visible = useChromeVisible();
  const reducedMotion = useReducedMotion();
  const fadeDuration = reducedMotion ? 0 : CHROME_FADE_MS;

  // A shared value driven from an effect, never `withTiming` inside the style
  // worklet: the worklet re-evaluates on every render of this component, and
  // this one re-renders on every recitation tick -- roughly once a second --
  // which would restart the curve from wherever the bar had got to.
  const chrome = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    chrome.value = withTiming(visible ? 1 : 0, { duration: fadeDuration });
  }, [visible, fadeDuration, chrome]);
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chrome.value,
    transform: [{ translateY: (1 - chrome.value) * BAR_TRAVEL }],
  }));

  // Measured, never assumed. The full bar's height depends on the reciter
  // name's line count and on the type scale, and a constant would clip the
  // transport on whichever device disagreed.
  const [compactHeight, setCompactHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const target = playing ? fullHeight : compactHeight;

  const height = useSharedValue(0);
  useEffect(() => {
    // Nothing measured yet. Skipping rather than animating to 0 is what keeps
    // the first frame from collapsing the bar it is about to draw.
    if (target <= 0) return;
    // The first measurement of either state snaps: there is no height to grow
    // FROM on the frame a state first appears, and a 0 -> full curve would
    // play an unasked-for entrance every time the player mounts.
    if (height.value === 0) height.value = target;
    else height.value = withTiming(target, { duration: reducedMotion ? 0 : GROW_MS });
  }, [target, reducedMotion, height]);
  const boxStyle = useAnimatedStyle(() =>
    // `height.value || undefined`, not a bare 0: before the first measurement
    // the box sizes to its content, which is how the content gets measured.
    height.value > 0 ? { height: height.value + SHADOW_ROOM * 2 } : {},
  );

  function measure(set: (value: number) => void) {
    return (event: LayoutChangeEvent) => set(event.nativeEvent.layout.height);
  }

  return (
    <Animated.View
      testID="mushaf-player"
      // `none` and not `box-none` while hidden: a bar faded to nothing still
      // occupies the bottom of the page, and the tap meant to bring the chrome
      // back would land on it instead.
      pointerEvents={visible ? 'box-none' : 'none'}
      // Out of the reading order with the chrome, the same rule the tab bar
      // and the mushaf header follow. A bar TalkBack can reach is a bar the
      // user cannot see to know they reached.
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        {
          position: 'absolute',
          left: 16 - SHADOW_ROOM,
          right: 16 - SHADOW_ROOM,
          bottom: bottomOffset - SHADOW_ROOM,
          // The clip the grow animates against. See SHADOW_ROOM.
          overflow: 'hidden',
        },
        chromeStyle,
      ]}
    >
      <Animated.View pointerEvents="box-none" style={boxStyle}>
        {/* Absolute, and anchored to the bottom. Absolute because a child
            inside a height-animated clip otherwise measures the clip rather
            than itself and reports the height it is being given -- so the
            grow would run 0 -> 0 for ever. Bottom-anchored because the bar
            grows upward from the tab pill it docks above. */}
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: SHADOW_ROOM, right: SHADOW_ROOM, bottom: SHADOW_ROOM }}
        >
          {playing ? (
            <View testID="mushaf-player-full" onLayout={measure(setFullHeight)}>
              <RecitationBar
                dock={false}
                ayahNumber={ayahNumber}
                playing={playing}
                positionSec={positionSec}
                durationSec={durationSec}
                reciterLabel={reciterLabel}
                uiLocale={uiLocale}
                onTogglePlay={onTogglePlay}
                onSkipNext={onSkipNext}
                onSkipPrevious={onSkipPrevious}
                onSeek={onSeek}
                onOpenReciters={onOpenReciters}
              />
            </View>
          ) : (
            <View testID="mushaf-player-compact" onLayout={measure(setCompactHeight)}>
              <GlassSurface
                docked
                radius="pill"
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}
              >
                <Pressable
                  testID="mushaf-player-reciter"
                  accessibilityRole="button"
                  // The name alone announces as a proper noun with nothing to
                  // say it is a control: "Reciter, Mahmoud Khalil Al-Husary".
                  accessibilityLabel={`${t(uiLocale, 'reader.reciter')}, ${reciterLabel}`}
                  onPress={onOpenReciters}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: touchTargets.minimum,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color: theme.text, fontSize: typography.caption, flexShrink: 1 }}
                  >
                    {reciterLabel}
                  </Text>
                  <Icon name="chevronDown" color={theme.mutedText} size={14} />
                </Pressable>
                <Pressable
                  testID="mushaf-player-play"
                  accessibilityRole="button"
                  // Not "Play": this control starts the page, not whatever the
                  // last thing to play was, and on a page of 15 lines that is
                  // the fact worth announcing.
                  accessibilityLabel={t(uiLocale, 'mushaf.playPage')}
                  onPress={onTogglePlay}
                  style={{
                    minHeight: touchTargets.minimum,
                    minWidth: touchTargets.minimum,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="play" color={theme.accent} size={22} />
                </Pressable>
              </GlassSurface>
            </View>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}
