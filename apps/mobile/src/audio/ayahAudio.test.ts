import { describe, expect, it, vi } from 'vitest';
import { getAyahAudioUrl } from './ayahAudio';

describe('getAyahAudioUrl', () => {
  it('calls the thin endpoint with Abdul Rashid Sufi as default reciter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        url: 'https://audio.example/001001.mp3',
        duration_ms: 5000,
        source: 'qua',
        attribution: 'Audio source',
      }),
    });

    const result = await getAyahAudioUrl({ baseUrl: 'https://api.example', surah: 1, ayah: 1 }, fetchMock as never);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/v1/audio/ayah?reciter=abdul-rashid-sufi&surah=1&ayah=1',
    );
    expect(result.url).toBe('https://audio.example/001001.mp3');
  });
});
