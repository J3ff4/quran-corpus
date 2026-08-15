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
    const fetchMock = audioFetch('https://api.example/001001.mp3');

    const result = await getAyahAudioUrl({ baseUrl: 'https://api.example', surah: 1, ayah: 1 }, fetchMock as never);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/v1/audio/ayah?reciter=abdul-rashid-sufi&surah=1&ayah=1',
    );
    expect(result.url).toBe('https://api.example/001001.mp3');
  });

  it('rejects an out-of-range reference before making the request', async () => {
    const fetchMock = audioFetch('https://api.example/001001.mp3');

    await expect(
      getAyahAudioUrl({ baseUrl: 'https://api.example', surah: 115, ayah: 1 }, fetchMock as never),
    ).rejects.toThrow(/surah 115/);
    await expect(
      getAyahAudioUrl({ baseUrl: 'https://api.example', surah: 1, ayah: 0 }, fetchMock as never),
    ).rejects.toThrow(/ayah 0/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a non-https url', async () => {
    // Expo opens file: and content: URIs, so a tampered response could aim
    // playback at a local resource.
    const fetchMock = audioFetch('file:///data/data/com.app/databases/user.db');

    await expect(
      getAyahAudioUrl({ baseUrl: 'https://api.example', surah: 1, ayah: 1 }, fetchMock as never),
    ).rejects.toThrow(/scheme file:/);
  });

  it('refuses a url from an origin outside the allowlist', async () => {
    const fetchMock = audioFetch('https://attacker.example/001001.mp3');

    await expect(
      getAyahAudioUrl({ baseUrl: 'https://api.example', surah: 1, ayah: 1 }, fetchMock as never),
    ).rejects.toThrow(/https:\/\/attacker.example/);
  });

  it('refuses a malformed payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ duration_ms: 5000 }) });

    await expect(
      getAyahAudioUrl({ baseUrl: 'https://api.example', surah: 1, ayah: 1 }, fetchMock as never),
    ).rejects.toThrow(/no url/);
  });

  it('passes the fetched audio URL to the selected player', async () => {
    const handle = { stopAsync: vi.fn(), unloadAsync: vi.fn() };
    const player = { playUrl: vi.fn().mockResolvedValue(handle) };
    const fetchMock = audioFetch('https://api.example/002001.mp3');

    await expect(
      playAyahAudioUrl({ baseUrl: 'https://api.example', surah: 2, ayah: 1 }, player, fetchMock as never),
    ).resolves.toBe(handle);
    expect(player.playUrl).toHaveBeenCalledWith('https://api.example/002001.mp3', expect.any(Function));
  });

  it('starts fetched audio URLs with the Expo Audio player', async () => {
    const subscription = { remove: vi.fn() };
    const nativePlayer = {
      play: vi.fn(),
      pause: vi.fn(),
      release: vi.fn(),
      remove: vi.fn(),
      addListener: vi.fn().mockReturnValue(subscription),
    };
    mocks.createAudioPlayer.mockReturnValue(nativePlayer);

    const playback = await expoAudioAyahAudioPlayer.playUrl('https://api.example/003001.mp3', () => undefined);
    expect(playback).toEqual({
      stopAsync: expect.any(Function),
      unloadAsync: expect.any(Function),
    });
    await playback.unloadAsync();

    expect(mocks.createAudioPlayer).toHaveBeenCalledWith('https://api.example/003001.mp3');
    expect(nativePlayer.play).toHaveBeenCalled();
    expect(subscription.remove).toHaveBeenCalled();
    expect(nativePlayer.remove).toHaveBeenCalled();
    expect(nativePlayer.release).toHaveBeenCalled();
    // Order matters on Android -- see the comment on unloadAsync. Asserting it
    // here because getting it backwards fails only on a device, never in CI.
    expect(nativePlayer.remove.mock.invocationCallOrder[0]).toBeLessThan(
      nativePlayer.release.mock.invocationCallOrder[0] as number,
    );
  });

  it('reports natural completion instead of leaving the ayah marked as playing', async () => {
    const handle = { stopAsync: vi.fn(), unloadAsync: vi.fn() };
    let finish: (() => void) | undefined;
    const player = {
      playUrl: vi.fn().mockImplementation((_url: string, onFinished: () => void) => {
        finish = onFinished;
        return Promise.resolve(handle);
      }),
    };
    stubAudioFetch('https://api.example/002255.mp3');
    const { result } = renderHook(() => useAyahAudioController('https://api.example', 2, player));

    await act(async () => {
      await result.current.toggleAyah(255);
    });
    expect(result.current.playingAyah).toBe(255);

    await act(async () => {
      finish?.();
    });

    expect(result.current.playingAyah).toBeNull();
    await waitFor(() => expect(handle.unloadAsync).toHaveBeenCalled());
  });

  it('unloads playback even when stopping rejects', async () => {
    const handle = { stopAsync: vi.fn().mockRejectedValue(new Error('stop failed')), unloadAsync: vi.fn() };
    const player = { playUrl: vi.fn().mockResolvedValue(handle) };
    stubAudioFetch('https://api.example/004001.mp3');
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
    stubAudioFetch('https://api.example/file.mp3');
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
    stubAudioFetch('https://api.example/005001.mp3');
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
    stubAudioFetch('https://api.example/file.mp3');
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

function audioFetch(url: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      url,
      duration_ms: 5000,
      source: 'qua',
      attribution: 'Audio source',
    }),
  });
}

function stubAudioFetch(url: string) {
  vi.stubGlobal('fetch', audioFetch(url));
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
