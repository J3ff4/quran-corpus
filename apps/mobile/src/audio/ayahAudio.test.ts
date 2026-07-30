import { describe, expect, it, vi } from 'vitest';
import { getAyahAudioUrl, playAyahAudioUrl } from './ayahAudio';

vi.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: vi.fn(),
    },
  },
}));

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

  it('passes the fetched audio URL to the selected player', async () => {
    const handle = { stopAsync: vi.fn(), unloadAsync: vi.fn() };
    const player = { playUrl: vi.fn().mockResolvedValue(handle) };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        url: 'https://audio.example/002001.mp3',
        duration_ms: 5000,
        source: 'qua',
        attribution: 'Audio source',
      }),
    });

    await expect(
      playAyahAudioUrl({ baseUrl: 'https://api.example', surah: 2, ayah: 1 }, player, fetchMock as never),
    ).resolves.toBe(handle);
    expect(player.playUrl).toHaveBeenCalledWith('https://audio.example/002001.mp3');
  });
});
