import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expoAudioAyahAudioPlayer, getAyahAudioUrl, playAyahAudioUrl, useAyahAudioController } from './ayahAudio';

const mocks = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
}));

vi.mock('expo-audio', () => ({
  createAudioPlayer: mocks.createAudioPlayer,
}));

describe('getAyahAudioUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

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

  it('starts fetched audio URLs with the Expo Audio player', async () => {
    const nativePlayer = { play: vi.fn(), pause: vi.fn(), release: vi.fn(), remove: vi.fn() };
    mocks.createAudioPlayer.mockReturnValue(nativePlayer);

    const playback = await expoAudioAyahAudioPlayer.playUrl('https://audio.example/003001.mp3');
    expect(playback).toEqual({
      stopAsync: expect.any(Function),
      unloadAsync: expect.any(Function),
    });
    await playback.unloadAsync();

    expect(mocks.createAudioPlayer).toHaveBeenCalledWith('https://audio.example/003001.mp3');
    expect(nativePlayer.play).toHaveBeenCalled();
    expect(nativePlayer.release).toHaveBeenCalled();
    expect(nativePlayer.remove).not.toHaveBeenCalled();
  });

  it('unloads playback even when stopping rejects', async () => {
    const handle = { stopAsync: vi.fn().mockRejectedValue(new Error('stop failed')), unloadAsync: vi.fn() };
    const player = { playUrl: vi.fn().mockResolvedValue(handle) };
    stubAudioFetch('https://audio.example/004001.mp3');
    const { result } = renderHook(() => useAyahAudioController('https://api.example', 4, player));

    await act(async () => {
      await result.current.toggleAyah(1);
    });
    await act(async () => {
      await result.current.toggleAyah(1);
    });

    expect(handle.stopAsync).toHaveBeenCalled();
    expect(handle.unloadAsync).toHaveBeenCalled();
    expect(result.current.playingAyah).toBeNull();
  });

  it('keeps the newest playback request active and unloads stale playback', async () => {
    const firstHandle = { stopAsync: vi.fn(), unloadAsync: vi.fn() };
    const secondHandle = { stopAsync: vi.fn(), unloadAsync: vi.fn() };
    const firstPlayback = deferred<{ stopAsync: () => Promise<unknown>; unloadAsync: () => Promise<unknown> }>();
    const secondPlayback = deferred<{ stopAsync: () => Promise<unknown>; unloadAsync: () => Promise<unknown> }>();
    const player = {
      playUrl: vi.fn()
        .mockReturnValueOnce(firstPlayback.promise)
        .mockReturnValueOnce(secondPlayback.promise),
    };
    stubAudioFetch('https://audio.example/file.mp3');
    const { result } = renderHook(() => useAyahAudioController('https://api.example', 2, player));

    let firstToggle = Promise.resolve();
    let secondToggle = Promise.resolve();
    await act(async () => {
      firstToggle = result.current.toggleAyah(1);
    });
    await act(async () => {
      secondToggle = result.current.toggleAyah(2);
    });
    await act(async () => {
      secondPlayback.resolve(secondHandle);
      await secondToggle;
    });
    await act(async () => {
      firstPlayback.resolve(firstHandle);
      await firstToggle;
    });

    expect(result.current.playingAyah).toBe(2);
    expect(firstHandle.stopAsync).toHaveBeenCalled();
    expect(firstHandle.unloadAsync).toHaveBeenCalled();
    expect(secondHandle.unloadAsync).not.toHaveBeenCalled();
  });

  it('stops and unloads active playback on unmount', async () => {
    const handle = { stopAsync: vi.fn(), unloadAsync: vi.fn() };
    const player = { playUrl: vi.fn().mockResolvedValue(handle) };
    stubAudioFetch('https://audio.example/005001.mp3');
    const { result, unmount } = renderHook(() => useAyahAudioController('https://api.example', 5, player));

    await act(async () => {
      await result.current.toggleAyah(1);
    });
    unmount();

    expect(handle.stopAsync).toHaveBeenCalled();
    await waitFor(() => expect(handle.unloadAsync).toHaveBeenCalled());
  });

  it('ignores stale stop errors after a newer playback request succeeds', async () => {
    const stopFailure = deferred<never>();
    const firstHandle = { stopAsync: vi.fn().mockReturnValue(stopFailure.promise), unloadAsync: vi.fn() };
    const secondHandle = { stopAsync: vi.fn(), unloadAsync: vi.fn() };
    const player = {
      playUrl: vi.fn()
        .mockResolvedValueOnce(firstHandle)
        .mockResolvedValueOnce(secondHandle),
    };
    stubAudioFetch('https://audio.example/file.mp3');
    const { result } = renderHook(() => useAyahAudioController('https://api.example', 2, player));

    await act(async () => {
      await result.current.toggleAyah(1);
    });

    let stopToggle = Promise.resolve();
    await act(async () => {
      stopToggle = result.current.toggleAyah(1);
    });
    await act(async () => {
      await result.current.toggleAyah(2);
    });
    await act(async () => {
      stopFailure.reject(new Error('stale stop failed'));
      await stopToggle;
    });

    expect(result.current.playingAyah).toBe(2);
    expect(result.current.audioError).toBeNull();
  });
});

function stubAudioFetch(url: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        url,
        duration_ms: 5000,
        source: 'qua',
        attribution: 'Audio source',
      }),
    }),
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}
