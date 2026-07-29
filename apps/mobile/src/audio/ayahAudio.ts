import { useState } from 'react';

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

export function useAyahAudioController(baseUrl: string | undefined, surah: number | null) {
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleAyah(ayah: number) {
    if (!baseUrl || !surah) return;
    if (playingAyah === ayah) {
      setPlayingAyah(null);
      return;
    }

    try {
      setError(null);
      await getAyahAudioUrl({ baseUrl, surah, ayah });
      setPlayingAyah(ayah);
    } catch (cause) {
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
