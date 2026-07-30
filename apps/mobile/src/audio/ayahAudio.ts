import { useRef, useState } from 'react';
import { Audio } from 'expo-av';

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

export const expoAvAyahAudioPlayer: AyahAudioPlayer = {
  async playUrl(url: string) {
    const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
    return sound;
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
  await handle.stopAsync();
  await handle.unloadAsync();
}

export function useAyahAudioController(
  baseUrl: string | undefined,
  surah: number | null,
  player: AyahAudioPlayer = expoAvAyahAudioPlayer,
) {
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playbackRef = useRef<PlaybackHandle | null>(null);

  async function toggleAyah(ayah: number) {
    if (!baseUrl || !surah) return;
    if (playingAyah === ayah) {
      await stopPlayback(playbackRef.current);
      playbackRef.current = null;
      setPlayingAyah(null);
      return;
    }

    try {
      setError(null);
      await stopPlayback(playbackRef.current);
      playbackRef.current = null;
      playbackRef.current = await playAyahAudioUrl({ baseUrl, surah, ayah }, player);
      setPlayingAyah(ayah);
    } catch (cause) {
      playbackRef.current = null;
      setPlayingAyah(null);
      setError(cause instanceof Error ? cause.message : 'Unable to load audio');
    }
  }

  return {
    audioEnabled: Boolean(baseUrl),
    audioError: error,
    playingAyah,
    toggleAyah,
  };
}
