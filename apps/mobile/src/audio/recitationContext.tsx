import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useRecitation, type CreateRecitationDriver } from './ayahAudio';
import { useAppSettings } from '@/settings/settingsStore';

/**
 * Which screen started the recitation that is sounding.
 *
 * A screen paints its playing highlight only for its own. Without it, the
 * reader starting 2:255 would put a green band on a mushaf page mounted behind
 * it that nobody is looking at -- and pausing from the mini-player would leave
 * two screens each believing they were the player.
 */
export type RecitationOwner = 'reader' | 'mushaf' | 'home';

export interface TrackContext {
  owner: RecitationOwner;
  surahId: number;
  /** Where continuous play stops. */
  ayahCount: number;
  /** Named on the lock screen. */
  surahName: string;
  continuous: boolean;
}

export type RecitationController = ReturnType<typeof useRecitation> & {
  /** What is sounding, and who asked for it. Null when nothing is. */
  track: TrackContext | null;
  /** Start (or toggle) an ayah under a track, replacing whatever was sounding. */
  toggle: (track: TrackContext, ayah: number) => void;
};

const RecitationContext = createContext<RecitationController | null>(null);

/**
 * One recitation engine for the whole app.
 *
 * It used to be one per screen: the reader and the mushaf each called
 * `useRecitation`, so the sound belonged to whichever screen you were standing
 * on and walking away from it left a bar you could not reach. One engine means
 * a transport can be docked anywhere, and it means one voice at a time --
 * starting the mushaf page stops the reader's ayah rather than sounding over
 * it.
 *
 * What the hook used to read off its rendering screen -- the surah, its ayah
 * count, its name, whether to run on -- now travels with the caller as a
 * `TrackContext`, handed over at the moment play is asked for. The provider
 * cannot look those up itself without opening the corpus database on the app's
 * root layout, which would put a SQLite read in every cold start; the two
 * screens that start recitation have the data loaded already.
 */
export function RecitationProvider({
  children,
  createDriver,
}: {
  children: ReactNode;
  /** Tests only. The app never passes one. */
  createDriver?: CreateRecitationDriver | undefined;
}) {
  const { reciterId } = useAppSettings();
  const [track, setTrack] = useState<TrackContext | null>(null);

  const audio = useRecitation(track?.surahId ?? null, track?.ayahCount ?? 0, reciterId, {
    continuous: track?.continuous ?? false,
    ...(track ? { surahName: track.surahName } : {}),
    ...(createDriver ? { createDriver } : {}),
  });

  const toggle = useCallback(
    (next: TrackContext, ayah: number) => {
      setTrack(next);
      // `next.surahId` passed explicitly, not left to the re-render: this call
      // runs against the render the state was read in, so the hook still has
      // the PREVIOUS track's surah. That is what the override argument exists
      // for.
      //
      // `surahName` goes the same way and for the same reason: it is read
      // straight into setLockScreen at the start of the track, so left to the
      // re-render the notification would name the surah the LAST screen was
      // playing.
      //
      // `ayahCount` and `continuous` are stale for the same one tick, and
      // harmlessly: the count only gates a preload one ayah ahead, and
      // continuous is not consulted until the track finishes -- seconds later,
      // long after the re-render has landed.
      audio.toggleAyah(ayah, next.surahId, next.surahName);
    },
    [audio],
  );

  const stop = useCallback(() => {
    audio.stop();
    setTrack(null);
  }, [audio]);

  const value = useMemo(
    () => ({ ...audio, track, toggle, stop }),
    [audio, track, toggle, stop],
  );

  return <RecitationContext.Provider value={value}>{children}</RecitationContext.Provider>;
}

export function useRecitationController(): RecitationController {
  const value = useContext(RecitationContext);
  // Thrown, not a null object. A screen rendered outside the provider would
  // otherwise draw a full transport whose every button silently did nothing,
  // which is the failure shape issue #63 was filed for -- and it would be a
  // mistake in the tree, visible on the first render, not something to
  // discover from a user.
  if (value === null) throw new Error('useRecitationController used outside RecitationProvider');
  return value;
}
