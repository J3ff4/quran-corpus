import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureAudioSession,
  createExpoRecitationDriver,
  useRecitation,
  type RecitationStatus,
} from './ayahAudio';
import { ayahAudioUrl } from '@quran-corpus/data/mobile';

const mocks = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
  setAudioModeAsync: vi.fn(async () => undefined),
  preload: vi.fn(async () => undefined),
  clearPreloadedSource: vi.fn(async () => undefined),
  clearAllPreloadedSources: vi.fn(async () => undefined),
}));

vi.mock('expo-audio', () => ({
  createAudioPlayer: mocks.createAudioPlayer,
  setAudioModeAsync: mocks.setAudioModeAsync,
  preload: mocks.preload,
  clearPreloadedSource: mocks.clearPreloadedSource,
  clearAllPreloadedSources: mocks.clearAllPreloadedSources,
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
    emit?.({ currentTime: 3, duration: 9, didJustFinish: false, playing: false, isBuffering: false, error: 'Source error' });
    driver.destroy();

    expect(onStatus).toHaveBeenCalledWith({
      currentTime: 3,
      duration: 9,
      didJustFinish: false,
      // Forwarded, not dropped: an OS pause is only ever visible here.
      playing: false,
      isBuffering: false,
      error: 'Source error',
    });
    expect(nativePlayer.clearLockScreenControls).toHaveBeenCalled();
    expect(subscription.remove).toHaveBeenCalled();
    // Order matters on Android -- see the comment on destroy(). Asserted here
    // because getting it backwards fails only on a device, never in CI.
    expect(nativePlayer.remove.mock.invocationCallOrder[0]).toBeLessThan(
      nativePlayer.release.mock.invocationCallOrder[0] as number,
    );
    // The preload cache is module-level, so it survives the player that filled
    // it. On Android nothing evicts it on its own.
    expect(mocks.clearAllPreloadedSources).toHaveBeenCalled();
  });

  it('drops one warmed source without touching the rest', () => {
    mocks.createAudioPlayer.mockReturnValue({
      addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
    });

    const driver = createExpoRecitationDriver('https://everyayah.com/data/Husary_64kbps/001001.mp3', vi.fn());
    driver.clearPreload('https://everyayah.com/data/Husary_64kbps/001001.mp3');

    expect(mocks.clearPreloadedSource).toHaveBeenCalledWith(
      'https://everyayah.com/data/Husary_64kbps/001001.mp3',
    );
    expect(mocks.clearAllPreloadedSources).not.toHaveBeenCalled();
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
    expect(r.state().playing).toBe(false);
  });

  it('keeps the finished ayah skippable', async () => {
    // The bar does not leave with the sound -- it stays docked on the ayah that
    // just ended, offering Previous, Play and Next. Clearing the ayah on finish
    // left two of those three doing nothing at all.
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(3);
    await player.finish();
    r.skipNext();

    expect(player.replaced).toEqual([ayahAudioUrl(1, 4, 'husary')]);
    expect(r.state().ayah).toBe(4);

    await player.finish();
    r.skipPrevious();

    expect(player.replaced).toEqual([ayahAudioUrl(1, 4, 'husary'), ayahAudioUrl(1, 3, 'husary')]);
  });

  it('replays a finished ayah rather than resuming an exhausted source', async () => {
    // play() on a player sitting at the end of its track does nothing, so the
    // resume path would leave the one working control on the docked bar dead.
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(3);
    await player.finish();
    r.toggleAyah(3);

    expect(player.replaced).toEqual([ayahAudioUrl(1, 3, 'husary')]);
    expect(r.state().playing).toBe(true);
  });

  it('resumes a paused ayah in the voice the bar is naming', () => {
    // Changing reciter mid-ayah takes effect from the next one (device check
    // 87) -- but a PAUSED ayah is not sounding, and resuming it in the old
    // voice under the new name is the bar lying about what is playing.
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(2);
    r.toggleAyah(2);
    expect(r.state().playing).toBe(false);

    r.changeReciter('sudais');
    r.toggleAyah(2);

    expect(player.replaced).toEqual([ayahAudioUrl(1, 2, 'sudais')]);
    expect(r.state().playing).toBe(true);
  });

  it('leaves a paused ayah alone when the reciter has not changed', () => {
    // The other direction: pause/resume must not reload the source, or every
    // resume restarts the ayah from the beginning.
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(2);
    r.toggleAyah(2);
    r.toggleAyah(2);

    expect(player.replaced).toEqual([]);
    expect(r.state().playing).toBe(true);
  });

  it('preloads the next ayah while the current one plays', () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

    r.toggleAyah(1);
    // The only lever we have against the gap between two per-ayah mp3s.
    expect(player.preloaded).toContain(ayahAudioUrl(1, 2, 'husary'));
  });

  it('drops the ayah it has left behind out of the preload cache', async () => {
    // Android keeps every preloaded source until it is cleared by hand, so
    // continuous play through a long surah retains the whole surah.
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

    r.toggleAyah(1);
    await player.finish();
    await player.finish();

    // Everything already played is gone, and the clears keep pace with the
    // playback rather than lagging further behind with every ayah.
    expect(player.cleared).toEqual([ayahAudioUrl(1, 1, 'husary'), ayahAudioUrl(1, 2, 'husary')]);
    // Never the file the player is actually on: 1:3 is sounding and 1:4 is warm
    // for the seam, which is the whole two-entry ceiling.
    expect(player.cleared).not.toContain(ayahAudioUrl(1, 3, 'husary'));
    expect(player.preloaded).toContain(ayahAudioUrl(1, 4, 'husary'));
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

  it('stops claiming to play when something else takes audio focus', async () => {
    // Device check 86, 2026-08-26: a call or another app pausing us never goes
    // through toggleAyah, and the bar was left showing Pause over a frozen
    // clock and silence.
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(1);
    expect(r.state().playing).toBe(true);

    await player.tick({ playing: false, isBuffering: false, currentTime: 3 });

    expect(r.state().playing).toBe(false);
    // Parked on the ayah, not cleared: one tap has to resume where it stopped.
    expect(r.state().ayah).toBe(1);
    expect(r.state().positionSec).toBe(3);
  });

  it('rides out a buffering stall without touching the button', async () => {
    // The other half of the same signal. A stall reports `playing: false` too,
    // and flipping the button on every one of those was the reason this event
    // went unread in the first place.
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(1);
    await player.tick({ playing: false, isBuffering: true });

    expect(r.state().playing).toBe(true);
  });

  it('ignores a not-playing tick from a source that has not sounded yet', async () => {
    // A source still loading is indistinguishable from a paused one on this
    // event, so a status arriving before the first note must not read as an
    // interruption -- otherwise every ayah starts by flipping itself to Play.
    const player = fakePlayer({ announcePlaying: false });
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(1);
    await player.tick({ playing: false, isBuffering: false });

    expect(r.state().playing).toBe(true);
  });

  it('does not bounce back to paused on the tick after a resume', async () => {
    // Resuming an interrupted ayah re-arms the same ambiguity: the player can
    // still report `playing: false` on the tick that play() has not reached
    // yet, and by then it has already been heard once.
    const player = fakePlayer();
    const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

    r.toggleAyah(1);
    await player.tick({ playing: false, isBuffering: false });
    expect(r.state().playing).toBe(false);

    r.toggleAyah(1);
    await player.tick({ playing: false, isBuffering: false });

    expect(r.state().playing).toBe(true);
    expect(player.plays).toBe(2);
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
describe('paging to another surah', () => {
  it('stops the recitation when the surah changes under it', () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 2, ayahCount: 286, player, continuous: false });
    r.toggleAyah(50);
    expect(r.state().playing).toBe(true);

    r.changeSurah(3);

    // Paging in place does not remount the hook, so without this the driver
    // keeps sounding al-Baqarah 50 under Aal-Imran, and the docked bar offers
    // a pause for an ayah that is no longer on screen.
    expect(player.pauses).toBe(1);
    expect(r.state().playing).toBe(false);
    expect(r.state().ayah).toBeNull();
  });

  it('leaves the driver alive so the next tap does not rebuild a player', () => {
    const player = fakePlayer();
    const r = renderRecitation({ surah: 2, ayahCount: 286, player, continuous: false });
    r.toggleAyah(50);

    r.changeSurah(3);
    r.toggleAyah(1);

    // One create, then a replace: destroying on every page turn would cost a
    // visible delay before the first syllable of the new surah.
    expect(player.created).toHaveLength(1);
    expect(player.destroyed).toBe(0);
    expect(player.replaced.at(-1)).toContain('003001');
  });
});

function fakePlayer({
  duration = 30,
  announcePlaying = true,
}: { duration?: number; announcePlaying?: boolean } = {}) {
  let onStatus: ((status: RecitationStatus) => void) | null = null;
  const recorder = {
    created: [] as string[],
    replaced: [] as string[],
    preloaded: [] as string[],
    cleared: [] as string[],
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
          onStatus?.({
            currentTime: 0,
            duration,
            didJustFinish: false,
            // A real player reports itself playing on the tick after play().
            // `announcePlaying: false` models the one before that, where the
            // source is still loading and reports exactly what a pause does.
            playing: announcePlaying,
            isBuffering: false,
            error: null,
          });
        },
        pause: () => {
          recorder.pauses += 1;
        },
        replace: (next: string) => recorder.replaced.push(next),
        seekTo: (seconds: number) => recorder.seeks.push(seconds),
        preload: (next: string) => recorder.preloaded.push(next),
        clearPreload: (stale: string) => recorder.cleared.push(stale),
        setLockScreen: (title: string, artist: string) => recorder.lockScreen.push({ title, artist }),
        destroy: () => {
          recorder.destroyed += 1;
        },
      };
    },
    async finish() {
      await act(async () => {
        onStatus?.({
          currentTime: duration,
          duration,
          didJustFinish: true,
          playing: false,
          isBuffering: false,
          error: null,
        });
      });
    },
    /** One raw status event, defaulting to an ordinary playing tick. */
    async tick(status: Partial<RecitationStatus> = {}) {
      await act(async () => {
        onStatus?.({
          currentTime: 1,
          duration,
          didJustFinish: false,
          playing: true,
          isBuffering: false,
          error: null,
          ...status,
        });
      });
    },
    async fail(error: string) {
      await act(async () => {
        onStatus?.({
          currentTime: 0,
          duration: 0,
          didJustFinish: false,
          playing: false,
          isBuffering: false,
          error,
        });
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
  reciterId = 'husary',
}: {
  surah: number;
  ayahCount: number;
  player: ReturnType<typeof fakePlayer>;
  continuous: boolean;
  reciterId?: string;
}) {
  // The surah is a hook prop, not a closure: paging between surahs does not
  // remount this hook, so the only way to model it is to rerender with a
  // different one.
  let props = { reciter: reciterId, surahId: surah };
  const hook = renderHook(
    ({ reciter, surahId }: { reciter: string; surahId: number }) =>
      useRecitation(surahId, ayahCount, reciter, {
        surahName: 'Al-Fatihah',
        createDriver: player.create,
        // A prop, not a setter call: continuous play is a saved setting the
        // caller owns (M6i), so the only way to model it is to pass it in.
        continuous,
      }),
    { initialProps: props },
  );

  return {
    state: () => hook.result.current,
    toggleAyah: (ayah: number) => act(() => hook.result.current.toggleAyah(ayah)),
    seekTo: (seconds: number) => act(() => hook.result.current.seekTo(seconds)),
    skipNext: () => act(() => hook.result.current.skipNext()),
    skipPrevious: () => act(() => hook.result.current.skipPrevious()),
    /** The setting changing under the hook, the way the reciter sheet does. */
    changeReciter: (reciter: string) =>
      act(() => {
        props = { ...props, reciter };
        hook.rerender(props);
      }),
    /** The reader paging to another surah, which is a state change and not a
     *  remount. */
    changeSurah: (surahId: number) =>
      act(() => {
        props = { ...props, surahId };
        hook.rerender(props);
      }),
    unmount: hook.unmount,
  };
}
