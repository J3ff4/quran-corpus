import { useEffect, useRef, useState } from 'react';
import { createAudioPlayer } from 'expo-audio';

export interface AyahAudioParams {
  baseUrl: string;
  surah: number;
  ayah: number;
  reciter?: 'abdul-rashid-sufi';
}

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
  playUrl: (url: string, onFinished: () => void) => Promise<PlaybackHandle>;
}

export const expoAudioAyahAudioPlayer: AyahAudioPlayer = {
  async playUrl(url: string, onFinished: () => void) {
    const player = createAudioPlayer(url);
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) onFinished();
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
  const reciter = params.reciter ?? 'abdul-rashid-sufi';
  const url = new URL('/api/v1/audio/ayah', params.baseUrl);
  url.searchParams.set('reciter', reciter);
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
  onFinished: () => void = () => undefined,
): Promise<PlaybackHandle> {
  const audio = await getAyahAudioUrl(params, fetchFn);
  return player.playUrl(audio.url, onFinished);
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
  const [error, setError] = useState<string | null>(null);
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
    if (!baseUrl || !surah) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (playingAyah === ayah) {
      const playback = playbackRef.current;
      playbackRef.current = null;
      setPlayingAyah(null);
      try {
        await stopPlayback(playback);
      } catch (cause) {
        if (requestRef.current === requestId) {
          setError(cause instanceof Error ? cause.message : 'Unable to stop audio');
        }
      }
      return;
    }

    try {
      setError(null);
      const previousPlayback = playbackRef.current;
      playbackRef.current = null;
      await stopPlayback(previousPlayback).catch((cause) => {
        if (requestRef.current === requestId) {
          setError(cause instanceof Error ? cause.message : 'Unable to stop audio');
        }
      });

      // Audio that simply reaches its end never told anyone: the button stayed
      // on "Pause" for a finished ayah, and the handle stayed loaded until the
      // next toggle. Guarded by requestId so a track finishing after the user
      // has already started another one cannot clear the newer playback.
      const handleFinished = () => {
        if (requestRef.current !== requestId) return;
        const finished = playbackRef.current;
        playbackRef.current = null;
        setPlayingAyah(null);
        void stopPlayback(finished).catch(() => undefined);
      };

      const nextPlayback = await playAyahAudioUrl({ baseUrl, surah, ayah }, player, fetch, handleFinished);
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
      if (requestRef.current === requestId) {
        playbackRef.current = null;
        setPlayingAyah(null);
        setError(cause instanceof Error ? cause.message : 'Unable to load audio');
      }
    }
  }

  return {
    audioEnabled: Boolean(baseUrl),
    audioError: error,
    playingAyah,
    toggleAyah,
  };
}
