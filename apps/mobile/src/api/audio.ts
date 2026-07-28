export interface AyahAudioResponse {
  reciter: 'abdul-rashid-sufi';
  surah: number;
  ayah: number;
  url: string;
  duration_ms: number | null;
  source: string;
  attribution: string;
}

export async function getAyahAudioUrl(
  baseUrl: string,
  surah: number,
  ayah: number,
): Promise<AyahAudioResponse> {
  const url = new URL('/api/v1/audio/ayah', baseUrl);
  url.searchParams.set('reciter', 'abdul-rashid-sufi');
  url.searchParams.set('surah', String(surah));
  url.searchParams.set('ayah', String(ayah));

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio endpoint failed: ${response.status}`);
  return (await response.json()) as AyahAudioResponse;
}
