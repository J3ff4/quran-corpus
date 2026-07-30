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
  playUrl: (url: string) => Promise<PlaybackHandle>;
}

export const expoAudioAyahAudioPlayer: AyahAudioPlayer = {
  async playUrl(url: string) {
    const player = createAudioPlayer(url);
    player.play();
    return {
      stopAsync: async () => player.pause(),
      unloadAsync: async () => player.release(),
    };
  },
};

export async function getAyahAudioUrl(
  params: AyahAudioParams,
  fetchFn: typeof fetch = fetch,
): Promise<AyahAudioResponse> {
  const reciter = params.reciter ?? 'abdul-rashid-sufi';
  const url = new URL('/api/v1/audio/ayah', params.baseUrl);
  url.searchParams.set('reciter', reciter);
  url.searchParams.set('surah', String(params.surah));
  url.searchParams.set('ayah', String(params.ayah));

  const response = await fetchFn(url.toString());
  if (!response.ok) throw new Error(`Audio endpoint failed with ${response.status}`);
  return (await response.json()) as AyahAudioResponse;
}

export async function playAyahAudioUrl(
  params: AyahAudioParams,
  player: AyahAudioPlayer,
  fetchFn: typeof fetch = fetch,
): Promise<PlaybackHandle> {
  const audio = await getAyahAudioUrl(params, fetchFn);
  return player.playUrl(audio.url);
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

      const nextPlayback = await playAyahAudioUrl({ baseUrl, surah, ayah }, player);
      if (requestRef.current !== requestId) {
        await stopPlayback(nextPlayback).catch(() => undefined);
        return;
      }

      playbackRef.current = nextPlayback;
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
