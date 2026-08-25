import { useEffect, useRef, useState } from 'react';
import { createAudioPlayer } from 'expo-audio';
import {
  ayahAudioUrl,
  reciterById,
  AYAH_AUDIO_ORIGIN,
  DEFAULT_RECITER_ID,
} from '@quran-corpus/data/mobile';
import type { UiStringKey } from '../i18n/uiStrings';

const DEFAULT_RECITER_ATTRIBUTION = `${reciterById(DEFAULT_RECITER_ID)?.label ?? ''} — everyayah.com`;

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

interface PlaybackHandle {
  stopAsync: () => Promise<unknown>;
  unloadAsync: () => Promise<unknown>;
}

export interface AyahAudioPlayer {
  /** onStopped fires once playback ends, with the driver's message if it failed. */
  playUrl: (url: string, onStopped: (error: string | null) => void) => Promise<PlaybackHandle>;
}

export const expoAudioAyahAudioPlayer: AyahAudioPlayer = {
  async playUrl(url: string, onStopped: (error: string | null) => void) {
    const player = createAudioPlayer(url);
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      // A failed load never rejects play(): ExoPlayer reports it on this same
      // status event. Without reading it, an offline tap or a 404 leaves the
      // card on "Pause" for ever with nothing playing and nothing said.
      if (status.error) onStopped(status.error);
      else if (status.didJustFinish) onStopped(null);
    });
    player.play();
    return {
      stopAsync: async () => player.pause(),
      // Both calls, in this order. On Android they do different halves of the
      // teardown: AudioModule holds every player in a strong-ref
      // ConcurrentHashMap, `remove()` drops that entry without touching the
      // ExoPlayer, and `release()` tears down the ExoPlayer without touching
      // the map. release() alone leaked a released player into the registry,
      // which setAudioModeAsync and OnDestroy then iterate and call .ref.stop()
      // on -- one leak per ayah played. remove() has to come first: release()
      // unlinks the JS shared object, leaving no native counterpart to resolve.
      unloadAsync: async () => {
        subscription.remove();
        player.remove();
        player.release();
      },
    };
  },
};

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

export async function playAyahAudioUrl(
  params: AyahAudioParams,
  player: AyahAudioPlayer,
  fetchFn: typeof fetch = fetch,
  onStopped: (error: string | null) => void = () => undefined,
): Promise<PlaybackHandle> {
  const audio = await getAyahAudioUrl(params, fetchFn);
  return player.playUrl(audio.url, onStopped);
}

async function stopPlayback(handle: PlaybackHandle | null) {
  if (!handle) return;
  try {
    await handle.stopAsync();
  } finally {
    await handle.unloadAsync();
  }
}

export function useAyahAudioController(
  baseUrl: string | undefined,
  surah: number | null,
  player: AyahAudioPlayer = expoAudioAyahAudioPlayer,
) {
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  // A key, not a message. Playback failures come from ExoPlayer and fetch in
  // English; the screen localizes this and the cause goes to the log instead.
  const [error, setError] = useState<UiStringKey | null>(null);
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    return () => {
      requestRef.current += 1;
      const playback = playbackRef.current;
      playbackRef.current = null;
      void stopPlayback(playback).catch(() => undefined);
    };
  }, []);

  async function toggleAyah(ayah: number) {
    if (!surah) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (playingAyah === ayah) {
      const playback = playbackRef.current;
      playbackRef.current = null;
      setPlayingAyah(null);
      try {
        await stopPlayback(playback);
      } catch (cause) {
        console.error('[audio] stop failed', { surah, ayah, cause });
        if (requestRef.current === requestId) setError('reader.audioFailed');
      }
      return;
    }

    try {
      setError(null);
      const previousPlayback = playbackRef.current;
      playbackRef.current = null;
      await stopPlayback(previousPlayback).catch((cause: unknown) => {
        console.error('[audio] stop failed', { surah, ayah, cause });
        if (requestRef.current === requestId) setError('reader.audioFailed');
      });

      // Audio that simply reaches its end never told anyone: the button stayed
      // on "Pause" for a finished ayah, and the handle stayed loaded until the
      // next toggle. Same path reports a failed load, which never arrives as a
      // rejection. Guarded by requestId so a track ending after the user has
      // already started another one cannot clear the newer playback.
      const handleStopped = (playbackError: string | null) => {
        if (requestRef.current !== requestId) return;
        const stopped = playbackRef.current;
        playbackRef.current = null;
        setPlayingAyah(null);
        if (playbackError) {
          console.error('[audio] playback failed', { surah, ayah, playbackError });
          setError('reader.audioFailed');
        }
        void stopPlayback(stopped).catch(() => undefined);
      };

      const nextPlayback = await playAyahAudioUrl({ baseUrl, surah, ayah }, player, fetch, handleStopped);
      if (requestRef.current !== requestId) {
        await stopPlayback(nextPlayback).catch(() => undefined);
        return;
      }

      playbackRef.current = nextPlayback;
      // Clear again, not just at the top: stopping the *previous* handle above
      // can set an error, and this play superseded it. Without this the user
      // reads "Unable to stop audio" while the new ayah is audibly playing.
      setError(null);
      setPlayingAyah(ayah);
    } catch (cause) {
      console.error('[audio] load failed', { surah, ayah, cause });
      if (requestRef.current === requestId) {
        playbackRef.current = null;
        setPlayingAyah(null);
        setError('reader.audioFailed');
      }
    }
  }

  return {
    // Not `Boolean(baseUrl)` any more: audio no longer needs an endpoint to
    // resolve a URL, so the buttons are live in every build. What it still
    // needs is the network -- offline, playback fails and says so.
    audioEnabled: true,
    audioError: error,
    playingAyah,
    toggleAyah,
  };
}
