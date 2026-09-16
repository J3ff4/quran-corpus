import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { GlassSurface } from '@/components/GlassSurface';
import { PlayerShell, SHADOW_ROOM } from '@/components/PlayerShell';
import { RecitationBar } from '@/components/RecitationBar';
import { Icon } from '@/components/icons/Icon';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { showChrome, useChromeVisible } from '@/mushaf/chromeVisibility';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** Matches `GlassTabBar` and `MushafChrome`, so the whole chrome leaves together. */
const CHROME_FADE_MS = 220;
/** Far enough to clear the player, the tab pill under it and both insets. */
const BAR_TRAVEL = 220;
/** The grow. 180ms read as a snap rather than a motion on the device (owner,
 *  2026-09-15), so it is slower than the chrome fade now: the bar unfolds
 *  under the thumb that pressed play and that unfolding is worth seeing. */
const GROW_MS = 280;

export interface MushafPlayerProps {
  /** Sound is coming out. The ONLY thing that picks compact vs full. A bar
   *  keyed on `ayahNumber` instead would never shrink: the parked ayah
   *  survives a pause on purpose, so resume knows where to go. */
  playing: boolean;
  /** Parked ayah, for the full bar's label. Null before the first play. */
  ayahNumber: number | null;
  /** The surah that ayah belongs to. The bar mirrors recitations started on
   *  other screens, so the surah is not this page's to assume. */
  surahName?: string | undefined;
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
  /** The X. Stops the recitation; the bar then shrinks back to its resting
   *  line rather than leaving, because on the mushaf that line is the only way
   *  to start a page (owner, 2026-09-16). Every other player in the app
   *  dismisses itself instead -- this one has nowhere to dismiss to. */
  onDismiss: () => void;
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
  surahName,
  positionSec,
  durationSec,
  reciterLabel,
  uiLocale,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  onSeek,
  onOpenReciters,
  onDismiss,
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

  return (
    <Animated.View
      testID="mushaf-player"
      // `none` and not `box-none` while hidden: a bar faded to nothing still
      // occupies the bottom of the page, and the tap meant to bring the chrome
      // back would land on it instead.
      pointerEvents={visible ? 'box-none' : 'none'}
      // Ruling 10: the idle countdown runs from the last touch of the player,
      // not from the last page turn -- so a reader working the transport is
      // never left reaching for a bar that slid away mid-press.
      //
      // Capture phase returning false: this observes every touch starting
      // anywhere inside without claiming the responder, so the transport
      // buttons and the scrub pan behave exactly as they did. It does not
      // cover the scrub track, whose pan runs through gesture-handler and
      // never enters RN's responder system -- `onInteract` on the bar below is
      // what reaches that one.
      onStartShouldSetResponderCapture={() => {
        showChrome();
        return false;
      }}
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
      <PlayerShell
        expanded={playing}
        growMs={reducedMotion ? 0 : GROW_MS}
        full={
          <View testID="mushaf-player-full">
          <RecitationBar
            dock={false}
            ayahNumber={ayahNumber}
            surahName={surahName}
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
            onDismiss={onDismiss}
            onInteract={showChrome}
          />
          </View>
        }
        compact={
          <View testID="mushaf-player-compact">
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
        }
      />
    </Animated.View>
  );
}
