import { useEffect, useRef, useState } from 'react';
import { createAudioPlayer, preload, setAudioModeAsync } from 'expo-audio';
import {
  ayahAudioUrl,
  reciterById,
  AYAH_AUDIO_ORIGIN,
  DEFAULT_RECITER_ID,
} from '@quran-corpus/data/mobile';
import type { UiStringKey } from '../i18n/uiStrings';

const DEFAULT_RECITER_ATTRIBUTION = `${reciterById(DEFAULT_RECITER_ID)?.label ?? ''} — everyayah.com`;

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

export interface AyahAudioParams {
  /** The thin endpoint's origin. Undefined until one is deployed. */
  baseUrl?: string | undefined;
  surah: number;
  ayah: number;
}

/** Only meaningful to the endpoint; the public fallback serves one recitation. */
const ENDPOINT_RECITER = 'abdul-rashid-sufi';

export interface AyahAudioResponse {
  url: string;
  duration_ms: number | null;
  source: string;
  attribution: string;
}

// al-Baqarah, the longest surah. A cheap upper bound is enough here: the point
// is to keep an out-of-range or non-integer value from ever reaching the query
// string, not to know each surah's exact length.
const MAX_AYAH = 286;

function assertAyahReference(surah: number, ayah: number) {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
    throw new Error(`Refusing audio request for surah ${surah}`);
  }
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > MAX_AYAH) {
    throw new Error(`Refusing audio request for ayah ${ayah}`);
  }
}

/**
 * Origins an audio URL may point at.
 *
 * Defaults to the endpoint's own origin and fails closed: if audio is served
 * from a separate CDN, list it in EXPO_PUBLIC_AUDIO_ALLOWED_ORIGINS rather than
 * widening this. The response used to be cast straight to the result type and
 * handed to createAudioPlayer, and Expo will happily open file: and content:
 * URIs -- so a malformed or tampered response could point playback at a local
 * resource instead of at audio.
 */
function allowedAudioOrigins(baseUrl: string): Set<string> {
  const configured = (process.env.EXPO_PUBLIC_AUDIO_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin: string) => origin.trim())
    .filter(Boolean);
  return new Set([new URL(baseUrl).origin, ...configured]);
}

function parseAudioResponse(payload: unknown, baseUrl: string): AyahAudioResponse {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Audio endpoint returned a malformed payload');
  }

  const { url, duration_ms: durationMs, source, attribution } = payload as Record<string, unknown>;
  if (typeof url !== 'string') throw new Error('Audio endpoint returned no url');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Audio endpoint returned a relative url');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Refusing audio url with scheme ${parsed.protocol}`);
  }
  if (!allowedAudioOrigins(baseUrl).has(parsed.origin)) {
    throw new Error(`Refusing audio url from ${parsed.origin}`);
  }

  return {
    url: parsed.toString(),
    duration_ms: typeof durationMs === 'number' ? durationMs : null,
    source: typeof source === 'string' ? source : '',
    attribution: typeof attribution === 'string' ? attribution : '',
  };
}

export async function getAyahAudioUrl(
  params: AyahAudioParams,
  fetchFn: typeof fetch = fetch,
): Promise<AyahAudioResponse> {
  assertAyahReference(params.surah, params.ayah);

  // No endpoint has ever been deployed, so with the fetch as the only path the
  // Play button was dead in every build. Fall back to the source the web reader
  // already streams from, built by the shared helper so the two cannot drift.
  // The URL is constructed here from two validated integers rather than parsed
  // out of a response, so none of the checks in parseAudioResponse apply to it.
  if (!params.baseUrl) {
    return {
      url: ayahAudioUrl(params.surah, params.ayah),
      duration_ms: null,
      source: AYAH_AUDIO_ORIGIN,
      // The fallback plays the default reciter, so it credits that one.
      attribution: DEFAULT_RECITER_ATTRIBUTION,
    };
  }

  const url = new URL('/api/v1/audio/ayah', params.baseUrl);
  url.searchParams.set('reciter', ENDPOINT_RECITER);
  url.searchParams.set('surah', String(params.surah));
  url.searchParams.set('ayah', String(params.ayah));

  const response = await fetchFn(url.toString());
  if (!response.ok) throw new Error(`Audio endpoint failed with ${response.status}`);
  return parseAudioResponse(await response.json(), params.baseUrl);
}


/** The slice of expo-audio's `AudioStatus` that recitation actually reads. */
export interface RecitationStatus {
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
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
    setLockScreen: (title: string, artist: string) =>
      player.setActiveForLockScreen(true, { title, artist }),
    destroy: () => {
      player.clearLockScreenControls();
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
  const [continuous, setContinuous] = useState(false);

  const driverRef = useRef<RecitationDriver | null>(null);
  // The ayah the *driver* is on, which is not always the one in state: a status
  // event can arrive between starting an ayah and React committing the render
  // that records it, and an advance computed off a stale ayah plays the wrong
  // one.
  const ayahRef = useRef<number | null>(null);
  // Same reason, plus one of its own: a seek clamps the moment the user lets go
  // of the scrub bar, not one render later.
  const durationRef = useRef(Number.NaN);

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

    ayahRef.current = ayah;
    durationRef.current = Number.NaN;
    setState({ ayah, playing: true, positionSec: 0, durationSec: Number.NaN, error: null });

    // Re-asserted on every ayah rather than once on the first: the reciter can
    // change mid-surah (device check 87) and the artist line has to change with
    // it.
    driver.setLockScreen(options.surahName ?? `Surah ${surah}`, reciterById(reciterId)?.label ?? '');
    driver.play();

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
        ayahRef.current = null;
        setState(IDLE);
        return;
      }
      startAyah(next);
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
    if (driver && ayahRef.current === ayah && state.error === null) {
      // ponytail: our own flag, not status.playing. ExoPlayer reports `playing:
      // false` while it buffers, and mirroring that would flicker the button on
      // every stall. Device check 86 (an incoming call mid-recitation) is what
      // decides whether the OS pausing us needs to show here too.
      if (state.playing) {
        driver.pause();
        setState((current) => ({ ...current, playing: false }));
      } else {
        driver.play();
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

  useEffect(() => {
    return () => {
      const driver = driverRef.current;
      driverRef.current = null;
      ayahRef.current = null;
      driver?.destroy();
    };
  }, []);

  return { ...state, continuous, setContinuous, toggleAyah, seekTo, skipNext, skipPrevious };
}
