import { useEffect, useRef, useState } from 'react';
import {
  clearAllPreloadedSources,
  clearPreloadedSource,
  createAudioPlayer,
  preload,
  setAudioModeAsync,
} from 'expo-audio';
import { ayahAudioUrl, reciterById } from '@quran-corpus/data/mobile';
import type { UiStringKey } from '../i18n/uiStrings';

/**
 * Put the app's audio session in the mode recitation needs.
 *
 * `doNotMix` is not a preference: expo-audio's own docs make it a precondition
 * for lock-screen controls -- without exclusive focus the OS does not associate
 * the media session with our player. `shouldPlayInBackground` alone is not
 * enough either; on Android the OS stops background audio after roughly three
 * minutes unless a player has claimed the lock screen, which is what
 * setActiveForLockScreen does in the controller.
 *
 * Called once at startup rather than per play: the session is process-wide.
 */
export async function configureAudioSession(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: true,
  });
}

/** The slice of expo-audio's `AudioStatus` that recitation actually reads. */
export interface RecitationStatus {
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
  /** What the player is actually doing, which a pause we did not ask for is
   *  the only way to learn about. */
  playing: boolean;
  /** Told apart from a pause: a stall reports `playing: false` too. */
  isBuffering: boolean;
  error: string | null;
}

/**
 * The playback surface `useRecitation` drives.
 *
 * Narrow on purpose. Every decision worth testing lives in the controller --
 * when to advance, what to warm, where a seek lands -- and a fake implementing
 * these seven methods exercises all of it without a native module.
 * `createExpoRecitationDriver` is the only implementation that ships.
 */
export interface RecitationDriver {
  play(): void;
  pause(): void;
  /** Point the same player at another ayah. */
  replace(url: string): void;
  seekTo(seconds: number): void;
  /** Warm a URL nothing has asked for yet. Fire and forget. */
  preload(url: string): void;
  /** Drop a warmed URL again. On Android nothing else ever does. */
  clearPreload(url: string): void;
  setLockScreen(title: string, artist: string): void;
  destroy(): void;
}

export type CreateRecitationDriver = (
  url: string,
  onStatus: (status: RecitationStatus) => void,
) => RecitationDriver;

/**
 * One long-lived `AudioPlayer` per controller, not an `AudioPlaylist`.
 *
 * expo-audio 57 ships an AudioPlaylist with next()/previous(), which is the
 * obvious fit for continuous play. It has no `setActiveForLockScreen` -- that
 * method exists only on AudioPlayer -- so a playlist would trade decision 35's
 * lock-screen controls for a smoother advance. One player plus replace() keeps
 * the media session attached across every ayah of the surah.
 */
export const createExpoRecitationDriver: CreateRecitationDriver = (url, onStatus) => {
  const player = createAudioPlayer(url);
  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    // A failed load never rejects play(): ExoPlayer reports it on this same
    // status event. Without reading it, an offline tap or a 404 leaves the bar
    // on "Pause" for ever with nothing playing and nothing said.
    onStatus({
      currentTime: status.currentTime,
      duration: status.duration,
      didJustFinish: status.didJustFinish,
      playing: status.playing,
      isBuffering: status.isBuffering,
      error: status.error,
    });
  });

  return {
    play: () => player.play(),
    pause: () => player.pause(),
    replace: (next: string) => player.replace(next),
    // Both of these swallow their rejection. A seek that lands past a buffered
    // edge and a preload that 404s are each recoverable, and an unhandled
    // rejection out of a status callback takes a release build down with it.
    seekTo: (seconds: number) => {
      void player.seekTo(seconds).catch((cause: unknown) => {
        console.error('[audio] seek failed', { seconds, cause });
      });
    },
    preload: (next: string) => {
      void preload(next).catch((cause: unknown) => {
        console.error('[audio] preload failed', { url: next, cause });
      });
    },
    // expo-audio's preload cache is module-level and, on Android, holds every
    // source until it is cleared by hand -- continuous play through al-Baqarah
    // would otherwise retain 285 mp3s for the life of the process.
    clearPreload: (stale: string) => {
      void clearPreloadedSource(stale).catch((cause: unknown) => {
        console.error('[audio] clearing a preload failed', { url: stale, cause });
      });
    },
    setLockScreen: (title: string, artist: string) =>
      player.setActiveForLockScreen(true, { title, artist }),
    destroy: () => {
      player.clearLockScreenControls();
      // The cache outlives the player, so leaving the reader has to empty it.
      void clearAllPreloadedSources().catch((cause: unknown) => {
        console.error('[audio] clearing preloads failed', { cause });
      });
      // remove() and release(), in this order. On Android they do different
      // halves of the teardown: AudioModule holds every player in a strong-ref
      // ConcurrentHashMap, `remove()` drops that entry without touching the
      // ExoPlayer, and `release()` tears down the ExoPlayer without touching
      // the map. release() alone leaked a released player into the registry,
      // which setAudioModeAsync and OnDestroy then iterate and call .ref.stop()
      // on. remove() has to come first: release() unlinks the JS shared object,
      // leaving no native counterpart to resolve.
      subscription.remove();
      player.remove();
      player.release();
    },
  };
};

export interface RecitationState {
  /** The ayah the player is parked on; null when nothing is loaded. */
  ayah: number | null;
  playing: boolean;
  positionSec: number;
  /** NaN until the track reports one. */
  durationSec: number;
  error: UiStringKey | null;
}

const IDLE: RecitationState = {
  ayah: null,
  playing: false,
  positionSec: 0,
  durationSec: Number.NaN,
  error: null,
};

export interface RecitationOptions {
  /** Named on the lock screen (device check 82). */
  surahName?: string | undefined;
  createDriver?: CreateRecitationDriver | undefined;
  /** Whether to run on into the next ayah. Owned by the caller, because it is
   *  a saved setting (M6i) and this hook remounts on every reader entry. */
  continuous?: boolean | undefined;
}

/**
 * Recitation for one surah: play, pause, scrub, skip, and continuous play.
 *
 * Replaces useAyahAudioController, which created and tore down a player per
 * ayah. Its request-id guarding does not come across, and deliberately: that
 * existed to discard a resolved fetch whose user had already moved on, and
 * every step here -- building the URL, replacing the source, playing -- is
 * synchronous, so there is no late promise left to clobber newer state. The
 * error keying and the Android teardown order do come across unchanged.
 */
export function useRecitation(
  surah: number | null,
  ayahCount: number,
  reciterId: string,
  options: RecitationOptions = {},
) {
  const [state, setState] = useState<RecitationState>(IDLE);
  // Read from options, not held here. It used to be useState(false), which was
  // fine while the reader's own toggle was the only way to set it; now that
  // Settings offers it, a copy in here would reset on every reader mount and
  // then disagree with the switch the user had just moved.
  const continuous = options.continuous ?? false;

  const driverRef = useRef<RecitationDriver | null>(null);
  // The ayah the *driver* is on, which is not always the one in state: a status
  // event can arrive between starting an ayah and React committing the render
  // that records it, and an advance computed off a stale ayah plays the wrong
  // one.
  const ayahRef = useRef<number | null>(null);
  // Same reason, plus one of its own: a seek clamps the moment the user lets go
  // of the scrub bar, not one render later.
  const durationRef = useRef(Number.NaN);
  // What the driver is actually loaded with, which the *setting* stops
  // describing the moment the reciter changes under a paused ayah.
  const loadedReciterRef = useRef(reciterId);
  // The URL the driver is on. Kept only so the one before it can be dropped
  // from the preload cache.
  const loadedUrlRef = useRef<string | null>(null);
  // The ayah played to its end. ayahRef stays on it -- see handleStatus.
  const finishedRef = useRef(false);
  // Whether this ayah has been heard yet. An unplayed source reports
  // `playing: false` exactly like a paused one, so nothing may read a false
  // there as a pause until the player has been observed sounding at least
  // once -- see handleStatus.
  const soundedRef = useRef(false);

  function startAyah(ayah: number) {
    if (surah === null) return;

    let url: string;
    try {
      // Validated in packages/data: an unknown reciter or an out-of-range
      // coordinate throws there rather than being interpolated into a path.
      url = ayahAudioUrl(surah, ayah, reciterId);
    } catch (cause) {
      console.error('[audio] refused to build a url', { surah, ayah, reciterId, cause });
      setState((current) => ({ ...current, playing: false, error: 'reader.audioFailed' }));
      return;
    }

    const existing = driverRef.current;
    const createDriver = options.createDriver ?? createExpoRecitationDriver;
    // The listener is installed once, with the player, and outlives every
    // render -- so it is handed a ref rather than this render's closure, which
    // would keep answering with whatever ayah was current when the player was
    // created.
    const driver = existing ?? createDriver(url, (status) => statusRef.current(status));
    if (existing) existing.replace(url);
    driverRef.current = driver;

    const stale = loadedUrlRef.current;
    ayahRef.current = ayah;
    loadedReciterRef.current = reciterId;
    loadedUrlRef.current = url;
    finishedRef.current = false;
    soundedRef.current = false;
    durationRef.current = Number.NaN;
    setState({ ayah, playing: true, positionSec: 0, durationSec: Number.NaN, error: null });

    // Re-asserted on every ayah rather than once on the first: the reciter can
    // change mid-surah (device check 87) and the artist line has to change with
    // it.
    driver.setLockScreen(options.surahName ?? `Surah ${surah}`, reciterById(reciterId)?.label ?? '');
    driver.play();

    // One behind, not all: the file sounding right now was itself warmed by the
    // previous ayah, and clearing a source out from under the player is not
    // something to find out about on a user's device. Two entries is the most
    // the cache ever holds.
    if (stale !== null && stale !== url) driver.clearPreload(stale);

    // One ahead of the ayah just started, and only when we mean to reach it.
    // The seam between two per-ayah mp3s is the only thing preload can help
    // with, and warming a file continuous play will never play is someone's
    // mobile data.
    const next = ayah + 1;
    if (continuous && next <= ayahCount) driver.preload(ayahAudioUrl(surah, next, reciterId));
  }

  function handleStatus(status: RecitationStatus) {
    durationRef.current = status.duration;
    const ayah = ayahRef.current;

    if (status.error) {
      console.error('[audio] playback failed', { surah, ayah, error: status.error });
      driverRef.current?.pause();
      // Parked rather than cleared: the bar keeps the ayah with a Play on it,
      // so a failure that was only a dropped connection is one tap from a
      // retry. A key, not the driver's English message -- the screen localizes
      // it.
      setState((current) => ({ ...current, playing: false, error: 'reader.audioFailed' }));
      return;
    }

    if (status.didJustFinish) {
      const next = ayah === null ? null : ayah + 1;
      // The end of the surah stops. Wrapping would restart al-Fatiha behind a
      // locked screen with nothing on screen to say why.
      if (!continuous || next === null || next > ayahCount) {
        // Parked, not cleared. The bar outlives the sound -- SurahReader keeps
        // it docked on this ayah -- and skipNext/skipPrevious read ayahRef, so
        // clearing it left Next and Previous dead on a bar that was still on
        // screen offering them. `finished` is what keeps the Play button a
        // replay rather than a play() on an exhausted source.
        finishedRef.current = true;
        setState({ ...IDLE, ayah });
        return;
      }
      startAyah(next);
      return;
    }

    if (status.playing) soundedRef.current = true;

    // A pause nobody asked for: an incoming call, or another app taking audio
    // focus. It never goes through toggleAyah, so without this the bar keeps
    // its Pause icon over a frozen clock and silence -- device check 86, which
    // the note in toggleAyah nominated as the decider, and which failed on the
    // owner's phone on 2026-08-26.
    //
    // Three things keep it off our own transitions. `sounded` waits for the
    // player to have been heard, because a source still loading reports
    // `playing: false` in exactly the same way and mirroring that would flip
    // the button before the first note of every ayah. `isBuffering` excludes a
    // mid-ayah stall, which is what the old comment was protecting against.
    // And returning `current` unchanged when the flag already agrees keeps the
    // status tick from re-rendering the bar four times a second.
    if (soundedRef.current && !status.playing && !status.isBuffering) {
      setState((current) =>
        current.playing ? { ...current, playing: false, positionSec: status.currentTime } : current,
      );
      return;
    }

    setState((current) => ({
      ...current,
      positionSec: status.currentTime,
      durationSec: status.duration,
    }));
  }

  const statusRef = useRef(handleStatus);
  statusRef.current = handleStatus;

  function toggleAyah(ayah: number) {
    const driver = driverRef.current;
    // `state.error === null` is what makes the second tap after a failure a
    // retry rather than a resume: the source that failed is still loaded, so
    // play() on it does nothing and the user is left tapping a dead button
    // (device check 88, airplane mode). Falling through to startAyah replaces
    // the source and loads it again.
    // A finished ayah and a reciter changed while paused both have to fall
    // through to startAyah: the first because play() on an exhausted source
    // does nothing, the second because resuming would sound the old voice under
    // the new name the bar is already showing.
    if (
      driver &&
      ayahRef.current === ayah &&
      state.error === null &&
      !finishedRef.current &&
      loadedReciterRef.current === reciterId
    ) {
      // ponytail: our own flag, not status.playing. ExoPlayer reports `playing:
      // false` while it buffers, and mirroring that would flicker the button on
      // every stall. Check 86 has since answered the other half -- an OS pause
      // does have to show -- and handleStatus does that without giving the
      // stall back, so this stays reading our flag.
      if (state.playing) {
        driver.pause();
        setState((current) => ({ ...current, playing: false }));
      } else {
        driver.play();
        // Reset with the play, not only with a new ayah: `sounded` means heard
        // since we last asked for sound. Left standing from before the pause,
        // the first status tick after this -- which can still report
        // `playing: false` while the player acts on it -- would read as an OS
        // pause and bounce the button straight back.
        soundedRef.current = false;
        setState((current) => ({ ...current, playing: true, error: null }));
      }
      return;
    }
    startAyah(ayah);
  }

  function seekTo(seconds: number) {
    const driver = driverRef.current;
    if (!driver) return;
    const duration = durationRef.current;
    // The bar reports a fraction of its own width, and a stale duration or a
    // rotation can put that outside the track; what ExoPlayer does past the end
    // is not something to find out on a user's device. An unknown duration
    // clamps at zero only, because there is nothing yet to clamp the top
    // against.
    const upper = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
    const target = Math.min(Math.max(seconds, 0), upper);
    driver.seekTo(target);
    setState((current) => ({ ...current, positionSec: target }));
  }

  function skipNext() {
    const ayah = ayahRef.current;
    if (ayah !== null && ayah + 1 <= ayahCount) startAyah(ayah + 1);
  }

  function skipPrevious() {
    const ayah = ayahRef.current;
    if (ayah !== null && ayah > 1) startAyah(ayah - 1);
  }

  // Paging to another surah is a state change, not a remount (D48), so the
  // driver survives it still loaded with the previous surah's ayah. Left alone
  // it keeps sounding under the new surah, and the docked bar offers a pause
  // for an ayah that is no longer on screen.
  //
  // The driver is paused, not destroyed: destroying belongs to unmount below,
  // and rebuilding a player for the next tap costs a visible delay before the
  // first syllable.
  useEffect(() => {
    return () => {
      driverRef.current?.pause();
      ayahRef.current = null;
      finishedRef.current = false;
      soundedRef.current = false;
      setState(IDLE);
    };
  }, [surah]);

  useEffect(() => {
    return () => {
      const driver = driverRef.current;
      driverRef.current = null;
      ayahRef.current = null;
      driver?.destroy();
    };
  }, []);

  return { ...state, continuous, toggleAyah, seekTo, skipNext, skipPrevious };
}
