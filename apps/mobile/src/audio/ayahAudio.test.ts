import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureAudioSession,
  createExpoRecitationDriver,
  getAyahAudioUrl,
  useRecitation,
  type RecitationStatus,
} from './ayahAudio';
import { ayahAudioUrl } from '@quran-corpus/data/mobile';

const mocks = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
  setAudioModeAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-audio', () => ({
  createAudioPlayer: mocks.createAudioPlayer,
  setAudioModeAsync: mocks.setAudioModeAsync,
}));

describe('configureAudioSession', () => {
  it('claims exclusive focus and background playback', async () => {
    // Asserted value by value rather than "was called": doNotMix is a
    // precondition for the lock-screen controls, not a preference, and
    // shouldPlayInBackground is what keeps audio alive once the screen is off.
    // Either one silently downgraded still plays audio in the foreground, so
    // nothing else in this suite would notice.
    await configureAudioSession();

    expect(mocks.setAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: true,
    });
  });
});

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

  it('resolves the shared public URL when no endpoint is configured', async () => {
    // No thin endpoint is deployed, so this is the path every shipped build
    // takes; when it returned nothing the Play button was inert.
    const fetchMock = audioFetch('https://api.example/002255.mp3');

    const result = await getAyahAudioUrl({ surah: 2, ayah: 255 }, fetchMock as never);

    expect(result.url).toBe('https://everyayah.com/data/Husary_64kbps/002255.mp3');
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
});

describe('createExpoRecitationDriver', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('forwards playback status and tears the player down in the Android order', () => {
    const subscription = { remove: vi.fn() };
    let emit: ((status: Record<string, unknown>) => void) | undefined;
    const nativePlayer = {
      play: vi.fn(),
      pause: vi.fn(),
      replace: vi.fn(),
      seekTo: vi.fn().mockResolvedValue(undefined),
      setActiveForLockScreen: vi.fn(),
      clearLockScreenControls: vi.fn(),
      release: vi.fn(),
      remove: vi.fn(),
      addListener: vi.fn().mockImplementation((_event: string, listener: typeof emit) => {
        emit = listener;
        return subscription;
      }),
    };
    mocks.createAudioPlayer.mockReturnValue(nativePlayer);
    const onStatus = vi.fn();

    const driver = createExpoRecitationDriver('https://everyayah.com/data/Husary_64kbps/001001.mp3', onStatus);
    emit?.({ currentTime: 3, duration: 9, didJustFinish: false, error: 'Source error' });
    driver.destroy();

    expect(onStatus).toHaveBeenCalledWith({
      currentTime: 3,
      duration: 9,
      didJustFinish: false,
      error: 'Source error',
    });
    expect(nativePlayer.clearLockScreenControls).toHaveBeenCalled();
    expect(subscription.remove).toHaveBeenCalled();
    // Order matters on Android -- see the comment on destroy(). Asserted here
    // because getting it backwards fails only on a device, never in CI.
    expect(nativePlayer.remove.mock.invocationCallOrder[0]).toBeLessThan(
      nativePlayer.release.mock.invocationCallOrder[0] as number,
    );
  });
});

describe('useRecitation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('advances to the next ayah when continuous play is on', async () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

    r.toggleAyah(1);
    await player.finish();

    // The point of the whole feature. A controller that only clears state on
    // finish looks identical until you listen to it.
    expect(player.replaced).toEqual([ayahAudioUrl(1, 2, 'husary')]);
    expect(r.state().ayah).toBe(2);
  });

  it('stops at the end of the surah instead of wrapping', async () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

    r.toggleAyah(7);
    await player.finish();

    expect(player.replaced).toEqual([]);
    expect(r.state().playing).toBe(false);
  });

  it('does not advance when continuous play is off', async () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(1);
    await player.finish();

    expect(player.replaced).toEqual([]);
    expect(r.state().ayah).toBeNull();
  });

  it('preloads the next ayah while the current one plays', () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

    r.toggleAyah(1);
    // The only lever we have against the gap between two per-ayah mp3s.
    expect(player.preloaded).toContain(ayahAudioUrl(1, 2, 'husary'));
  });

  it('does not preload past the end of the surah', () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

    r.toggleAyah(7);

    // ayahAudioUrl would happily build 1:8. Nothing would ever play it, and on
    // a metered connection it is a file the user pays for twice over.
    expect(player.preloaded).toEqual([]);
  });

  it('clamps a seek to the track', () => {
    const player = fakePlayer({ duration: 12 });
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(1);
    r.seekTo(-5);
    r.seekTo(999);

    // The scrub bar reports a fraction of a width; a stale duration or a
    // rotated screen can put that outside the track, and ExoPlayer's behaviour
    // past the end is not something to find out on a user's device.
    expect(player.seeks).toEqual([0, 12]);
  });

  it('reports a failed load through the existing error key', async () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

    r.toggleAyah(1);
    await player.fail('404');

    expect(r.state().error).toBe('reader.audioFailed');
    // And it must not keep marching through the surah on a dead network.
    expect(player.replaced).toEqual([]);
  });

  it('retries a failed ayah instead of resuming a dead player', async () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(1);
    await player.fail('Source error: Unable to connect');
    r.toggleAyah(1);

    // The failed source is still loaded, so play() on it does nothing -- the
    // second tap has to reload it or the button is dead until the reader
    // navigates away (device check 88).
    expect(player.replaced).toEqual([ayahAudioUrl(1, 1, 'husary')]);
    expect(r.state().error).toBeNull();
  });

  it('pauses and resumes the same ayah on the same player', () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 2, ayahCount: 286, player, continuous: false });

    r.toggleAyah(255);
    r.toggleAyah(255);
    expect(r.state().playing).toBe(false);
    expect(player.pauses).toBe(1);

    r.toggleAyah(255);
    // Resumed, not restarted: a second createAudioPlayer would drop the media
    // session the lock screen is attached to.
    expect(r.state().playing).toBe(true);
    expect(player.created).toHaveLength(1);
    expect(player.replaced).toEqual([]);
  });

  it('names the surah and the reciter on the lock screen', () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(1);

    // Device check 82: a media notification with no title is what a stub looks
    // like from the lock screen.
    expect(player.lockScreen).toEqual([
      { title: 'Al-Fatihah', artist: 'Mahmoud Khalil Al-Husary (Murattal)' },
    ]);
  });

  it('tears the player down on unmount', () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(1);
    r.unmount();

    // Background playback keeps a player alive with no screen attached, so the
    // one thing that must still stop it is leaving the reader.
    expect(player.destroyed).toBe(1);
  });
});

/** A RecitationDriver that records what the controller asked it to do. */
function fakePlayer({ duration = 30 }: { duration?: number } = {}) {
  let onStatus: ((status: RecitationStatus) => void) | null = null;
  const recorder = {
    created: [] as string[],
    replaced: [] as string[],
    preloaded: [] as string[],
    seeks: [] as number[],
    lockScreen: [] as { title: string; artist: string }[],
    plays: 0,
    pauses: 0,
    destroyed: 0,
    create(url: string, listener: (status: RecitationStatus) => void) {
      recorder.created.push(url);
      onStatus = listener;
      return {
        play: () => {
          recorder.plays += 1;
          // The duration arrives on a status event, not from play() -- the
          // controller has to read it there or a seek has nothing to clamp
          // against.
          onStatus?.({ currentTime: 0, duration, didJustFinish: false, error: null });
        },
        pause: () => {
          recorder.pauses += 1;
        },
        replace: (next: string) => recorder.replaced.push(next),
        seekTo: (seconds: number) => recorder.seeks.push(seconds),
        preload: (next: string) => recorder.preloaded.push(next),
        setLockScreen: (title: string, artist: string) => recorder.lockScreen.push({ title, artist }),
        destroy: () => {
          recorder.destroyed += 1;
        },
      };
    },
    async finish() {
      await act(async () => {
        onStatus?.({ currentTime: duration, duration, didJustFinish: true, error: null });
      });
    },
    async fail(error: string) {
      await act(async () => {
        onStatus?.({ currentTime: 0, duration: 0, didJustFinish: false, error });
      });
    },
  };
  return recorder;
}

function renderRecitation({
  surah,
  ayahCount,
  player,
  continuous,
}: {
  surah: number;
  ayahCount: number;
  player: ReturnType<typeof fakePlayer>;
  continuous: boolean;
}) {
  const hook = renderHook(() =>
    useRecitation(surah, ayahCount, 'husary', {
      surahName: 'Al-Fatihah',
      createDriver: player.create,
    }),
  );
  if (continuous) act(() => hook.result.current.setContinuous(true));

  return {
    state: () => hook.result.current,
    toggleAyah: (ayah: number) => act(() => hook.result.current.toggleAyah(ayah)),
    seekTo: (seconds: number) => act(() => hook.result.current.seekTo(seconds)),
    unmount: hook.unmount,
  };
}

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
