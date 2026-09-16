import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type AccessibilityState,
  type LayoutChangeEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from './GlassSurface';
import { Icon, type IconName } from './icons/Icon';
import { usePressScale } from '@/motion/usePressScale';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** How thick the scrub track is drawn, and how tall its touch strip is. */
const TRACK_HEIGHT = 4;

/**
 * `m:ss`, or `--:--` for a duration that has not arrived yet.
 *
 * The placeholder is the whole reason this is a function and not a template
 * literal: `durationSec` is NaN until the player reports one, and every arithmetic
 * path from there renders `NaN:NaN` on the bar for the first second of every ayah.
 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Time left, as `-m:ss`. Never a bare minus in front of the placeholder. */
export function formatRemaining(positionSec: number, durationSec: number): string {
  // `> 0` rather than `isFinite`: expo-audio reports `duration: 0` on the
  // status ticks before the source has loaded, which is finite and renders
  // `-0:00` -- a real-looking clock on a track nobody has heard yet (device
  // run, 2026-09-14).
  if (!(durationSec > 0)) return '--:--';
  return `-${formatClock(Math.max(0, durationSec - positionSec))}`;
}

/**
 * Where a touch at `x` on a track `trackWidth` wide lands, in **seconds**.
 *
 * Seconds, not a 0..1 fraction: the controller clamps what it is given against
 * the track duration and seeks there, so handing it a fraction seeks half a
 * second into every ayah regardless of how long the ayah is.
 *
 * `null` means there is nothing to seek within -- no duration yet, or a track
 * that has not been laid out -- and the caller must not seek at all. Returning
 * 0 for that case would turn a stray touch during the first frames into a jump
 * back to the start of the ayah.
 */
export function scrubSeconds(x: number, trackWidth: number, durationSec: number): number | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || trackWidth <= 0) return null;
  return Math.min(Math.max(x / trackWidth, 0), 1) * durationSec;
}

export interface RecitationBarProps {
  /** null = nothing has played yet, so there is no bar. */
  ayahNumber: number | null;
  /** The surah the sounding ayah belongs to, transliterated. Omitted, the bar
   *  names the ayah alone -- which on a screen that is not the reader's says
   *  "Ayah 1" and nothing about which of the 114 surahs that is. */
  surahName?: string | undefined;
  playing: boolean;
  positionSec: number;
  /** NaN until the track reports one. */
  durationSec: number;
  /** Omitted together with `onToggleContinuous`, and then there is no repeat
   *  button at all. */
  continuous?: boolean;
  reciterLabel: string;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  /** Absolute seconds, never a 0..1 fraction. */
  onSeek: (sec: number) => void;
  /** Omitted hides the repeat button. The mushaf plays a page through whatever
   *  the setting says, so a toggle there would be a control that changes
   *  nothing the reader can hear on this screen. */
  onToggleContinuous?: (() => void) | undefined;
  /** Omitted renders the reciter name as plain text rather than a control.
   *  The picker arrives in M6f task 5; until then there is nothing for a tap
   *  to open, and a button that does nothing is worse than a label. */
  onOpenReciters?: () => void;
  uiLocale: UiLocaleCode;
  /** Every touch that reaches a control on this bar -- a transport press, and
   *  both ends of a scrub. The mushaf restarts its chrome countdown from it
   *  (M8 ruling 10); the reader has no chrome to keep up and passes none.
   *
   *  Both ends of the scrub, not just the begin: the countdown runs from the
   *  LAST touch, and a four-second drag reported only at its start would hide
   *  the chrome out from under the finger still holding it. */
  onInteract?: (() => void) | undefined;
  /** Omitted, there is no X. Supplied, a trailing button that ends the
   *  recitation -- the docked mini-player's way off a screen that is not the
   *  reader's or the mushaf's. */
  onDismiss?: (() => void) | undefined;
  /** Omitted, the bar docks itself above the gesture bar -- which is what the
   *  reader wants, since it is a stack screen with nothing under it. `false`
   *  leaves it in its parent's flow: the mushaf stacks it above the floating
   *  tab pill and inside its own grow animation, so the position is not this
   *  component's to choose there. */
  dock?: boolean;
}

/**
 * The docked transport from mockup `1e`: previous / play-pause / next, a scrub
 * track with elapsed and remaining, a continuous-play toggle, and the reciter
 * name.
 *
 * It outlives the sound on purpose: once an ayah has played the bar stays
 * docked on it, and its control flips to Play, so resuming is one tap on the
 * thing already on screen rather than a scroll back to the card.
 */
export function RecitationBar({
  ayahNumber,
  surahName,
  playing,
  positionSec,
  durationSec,
  continuous = false,
  reciterLabel,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  onSeek,
  onToggleContinuous,
  onOpenReciters,
  uiLocale,
  onInteract,
  onDismiss,
  dock = true,
}: RecitationBarProps) {
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  // Measured rather than assumed: the bar is inset from both screen edges and
  // shares its row with the two clocks, so the only place the track's width is
  // known is after layout.
  const [trackWidth, setTrackWidth] = useState(0);
  // Where the finger is during a drag. The player is seeked once, on release
  // -- seeking on every frame would ask ExoPlayer for a new decode ~60 times a
  // second -- so without this the thumb would sit still under a moving finger.
  const [dragSec, setDragSec] = useState<number | null>(null);

  const shownSec = dragSec ?? positionSec;

  function previewAt(x: number): number | null {
    const target = scrubSeconds(x, trackWidth, durationSec);
    if (target !== null) setDragSec(target);
    return target;
  }

  // minDistance(0) so a tap on the track seeks too: a pan that waits for
  // movement leaves a tap doing nothing at all, which reads as a dead control.
  // runOnJS because every handler below touches React state and props; there is
  // no shared value here worth a worklet.
  const scrub = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((event) => {
      onInteract?.();
      previewAt(event.x);
    })
    .onUpdate((event) => {
      previewAt(event.x);
    })
    .onEnd((event) => {
      onInteract?.();
      const target = previewAt(event.x);
      if (target !== null) onSeek(target);
    })
    // Clears on a cancelled gesture as well as a completed one. Left to onEnd
    // alone, a drag interrupted by a system gesture would freeze the thumb
    // wherever the finger was for the rest of the ayah.
    .onFinalize(() => setDragSec(null));

  if (ayahNumber === null) return null;

  const ayahLabel = `${t(uiLocale, 'reader.ayahLabel')} ${ayahNumber}`;
  // The surah first: it is the coarser coordinate, and the one a reader who
  // walked away from the screen that started this has lost track of.
  const trackLabel = surahName ? `${surahName} · ${ayahLabel}` : ayahLabel;
  // On screen the word "Ayah" is dead weight beside the surah that already
  // frames it -- "At-Tawbah · 2" is the coordinate a reader reads (owner,
  // 2026-09-16). Only when the surah is there to do the framing: alone, a bare
  // "2" on a bar names nothing. The spoken label keeps the word, since a
  // screen reader has no column of coordinates to read it against.
  const trackText = surahName ? `${surahName} · ${ayahNumber}` : ayahLabel;
  // Asked to play, but the track has told us nothing yet -- the bar would
  // otherwise read 0:00 / --:-- with a transport glyph on it, which is exactly
  // what a paused player looks like, so a tap that never starts (issue #63)
  // was indistinguishable from one that did and then stopped. `durationSec` is
  // the signal because it is unknown -- NaN before the first status tick, 0 on
  // every tick until the source loads -- and positive from then on; no second
  // piece of state to keep in step. `> 0` also catches NaN, which is not.
  const loading = playing && !(durationSec > 0);
  const action = t(uiLocale, playing ? 'reader.pause' : 'reader.play');
  const progress =
    durationSec > 0
      ? Math.min(Math.max(shownSec / durationSec, 0), 1)
      : 0;

  return (
    // The reader is a stack screen, so there is no tab pill to clear -- just
    // the gesture bar. Undocked, the parent has already placed it.
    <View
      testID="recitation-bar"
      // The label is here, not only on the button: "Pause" alone tells a
      // screen-reader user nothing about which ayah is sounding. No
      // `accessible` on it -- that would make the bar one element and swallow
      // the buttons inside it (see rn-accessible-view-collapses-children).
      accessibilityLabel={`${trackLabel} · ${loading ? t(uiLocale, 'reader.loadingAudio') : action}`}
      pointerEvents="box-none"
      style={dock ? { position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12 } : undefined}
    >
      <GlassSurface docked radius="pill" style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TransportButton
            icon="skipBack"
            label={t(uiLocale, 'reader.previousAyah')}
            color={theme.text}
            onInteract={onInteract}
            onPress={onSkipPrevious}
          />
          <TransportButton
            icon={playing ? 'pause' : 'play'}
            label={action}
            color={theme.accent}
            onInteract={onInteract}
            onPress={onTogglePlay}
            // Still pressable while loading, and still labelled Pause: a
            // stream that never opens has to be stoppable, and a button that
            // renames itself to a status leaves a screen-reader user with
            // nothing saying a press does anything. The wait is announced as
            // `busy` on the control and spelled out on the bar's own label.
            busy={loading}
          />
          <TransportButton
            icon="skipForward"
            label={t(uiLocale, 'reader.nextAyah')}
            color={theme.text}
            onInteract={onInteract}
            onPress={onSkipNext}
          />
          {/* Two lines rather than one: a reciter's full name runs to
              "Mohamed Siddiq El-Minshawi (Murattal)", which alongside the ayah
              number on one line leaves neither readable. */}
          <View style={{ flex: 1, paddingHorizontal: 6 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontSize: typography.caption }}>
              {trackText}
            </Text>
            <ReciterLabel label={reciterLabel} uiLocale={uiLocale} onPress={onOpenReciters} />
          </View>
          {onToggleContinuous ? (
            <TransportButton
              icon="repeat"
              label={t(uiLocale, 'reader.continuous')}
              color={continuous ? theme.accent : theme.mutedText}
              selected={continuous}
              onInteract={onInteract}
              onPress={onToggleContinuous}
            />
          ) : null}
          {onDismiss ? (
            <TransportButton
              icon="close"
              label={t(uiLocale, 'player.stop')}
              // Muted, not `danger`: it ends a recitation, it does not destroy
              // anything, and a red glyph beside a play button reads as a
              // warning about the audio rather than a way to put it away.
              color={theme.mutedText}
              onInteract={onInteract}
              onPress={onDismiss}
            />
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text testID="recitation-elapsed" style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {formatClock(shownSec)}
          </Text>
          <GestureDetector gesture={scrub}>
            <View
              testID="recitation-scrub"
              onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
              // ponytail: hidden from TalkBack rather than made `adjustable`.
              // An adjustable role without increment/decrement actions is a
              // control a screen reader can focus and not use; the transport
              // above already covers every essential function. Add the ±5s
              // actions when someone actually wants to scrub by voice.
              importantForAccessibility="no-hide-descendants"
              // Taller than the 4pt it draws: a 4pt touch strip is unhittable.
              style={{ flex: 1, height: touchTargets.compact, justifyContent: 'center' }}
            >
              <View
                style={{
                  height: TRACK_HEIGHT,
                  borderRadius: TRACK_HEIGHT / 2,
                  backgroundColor: theme.border,
                  overflow: 'hidden',
                }}
              >
                <View
                  testID="recitation-progress"
                  style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: theme.accent }}
                />
              </View>
            </View>
          </GestureDetector>
          <Text testID="recitation-remaining" style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {formatRemaining(shownSec, durationSec)}
          </Text>
        </View>
      </GlassSurface>
    </View>
  );
}

function TransportButton({
  icon,
  label,
  color,
  selected,
  busy,
  onInteract,
  onPress,
}: {
  icon: IconName;
  label: string;
  color: string;
  selected?: boolean;
  /** Waiting on something: the spinner replaces the glyph in the same box, so
   *  the row does not reflow under the thumb when the wait ends. */
  busy?: boolean;
  /** Reported alongside the press, never instead of it. */
  onInteract?: (() => void) | undefined;
  onPress: () => void;
}) {
  const press = usePressScale();
  const state: AccessibilityState | undefined =
    selected === undefined && !busy
      ? undefined
      : { ...(selected === undefined ? {} : { selected }), ...(busy ? { busy: true } : {}) };
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // Only the states there are to announce. On the three transport buttons
      // a `selected: false` would have TalkBack read "not selected" after
      // every press, and a `busy: false` the same for the wait.
      accessibilityState={state}
      onPress={() => {
        onInteract?.();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        press.style,
        {
          minHeight: touchTargets.compact,
          minWidth: touchTargets.compact,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator testID="recitation-loading" color={color} size="small" />
      ) : (
        <Icon name={icon} color={color} size={22} />
      )}
    </AnimatedPressable>
  );
}

/** The reciter's name: a button once there is a picker to open, plain text
 *  before that. */
function ReciterLabel({
  label,
  uiLocale,
  onPress,
}: {
  label: string;
  uiLocale: UiLocaleCode;
  // `| undefined` explicitly, not just optional: exactOptionalPropertyTypes is
  // on, so a prop forwarded from an optional one is not assignable to a bare
  // `?:`.
  onPress?: (() => void) | undefined;
}) {
  const theme = useThemeColors();
  const style = { color: onPress ? theme.accent : theme.mutedText, fontSize: typography.caption };

  if (!onPress) {
    return (
      <Text testID="recitation-reciter" numberOfLines={1} style={style}>
        {label}
      </Text>
    );
  }

  return (
    <Pressable
      testID="recitation-reciter"
      accessibilityRole="button"
      // The name alone announces as a proper noun with nothing to say it is a
      // control: "Reciter, Mahmoud Khalil Al-Husary".
      accessibilityLabel={`${t(uiLocale, 'reader.reciter')}, ${label}`}
      onPress={onPress}
    >
      <Text numberOfLines={1} style={style}>
        {label}
      </Text>
    </Pressable>
  );
}
