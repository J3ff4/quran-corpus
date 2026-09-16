import { View } from 'react-native';
import { usePathname } from 'expo-router';

import { RecitationBar } from './RecitationBar';
import { useTabBarTop } from './GlassTabBar';
import { useRecitationController } from '@/audio/recitationContext';
import { reciterById } from '@quran-corpus/data/mobile';
import { useAppSettings } from '@/settings/settingsStore';

/**
 * The tabs that already draw a transport of their own, by pathname.
 *
 * Pathname and not `useSegments()`: expo-router pops a trailing `index`
 * segment off the route info, so Home's segments are `['(tabs)']` and a check
 * for `'index'` never matches -- which put two transports on Home, the one
 * thing ruling 8 exists to prevent. The URL has no such quirk.
 */
const HAS_ITS_OWN_PLAYER = new Set(['/', '/mushaf']);

/**
 * The transport, docked over whichever tab you walked to while it was
 * sounding.
 *
 * Rendered by the tabs layout, which is what makes it a tab-screen thing by
 * construction (ruling 6): a pushed stack screen draws above that layout and
 * never sees it. Sheets need no suppression either -- `BottomSheet` is a RN
 * `<Modal>`, which the platform puts in its own window above every view in
 * this one.
 *
 * Gone entirely when nothing is sounding, rather than parked with a Play on
 * it. The reader's bar outlives its sound because the ayah it is docked on is
 * the one on screen; here there is nothing on screen it belongs to, so a
 * resting bar would be furniture on five tabs for a recitation that stopped.
 */
export function MiniPlayer() {
  const audio = useRecitationController();
  const { uiLocale, reciterId } = useAppSettings();
  const tabBarTop = useTabBarTop();
  const pathname = usePathname();

  // Read before the guard so it narrows: the toggle below needs the track it
  // is resuming, and `audio.track` is a property TypeScript cannot know stays
  // non-null inside a closure.
  const track = audio.track;
  const ayah = audio.ayah;
  // The mushaf has its player, Home has its card (ruling 8). Two transports on
  // one screen is two answers to "what is playing".
  //
  // Keyed on the TRACK, not on `playing`. A bar that vanished on pause would
  // take its own Pause button with it and leave a parked recitation with no
  // transport and no reachable X anywhere in the tabs -- and an OS pause (a
  // call, another app taking focus) would do the same unasked. The X is what
  // dismisses this bar; that is the whole reason it has one.
  if (track === null || ayah === null || HAS_ITS_OWN_PLAYER.has(pathname)) {
    return null;
  }

  return (
    <View
      testID="mini-player"
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: tabBarTop + 8 }}
    >
      <RecitationBar
        dock={false}
        ayahNumber={ayah}
        surahName={track.surahName}
        playing={audio.playing}
        positionSec={audio.positionSec}
        durationSec={audio.durationSec}
        reciterLabel={reciterById(reciterId)?.label ?? ''}
        uiLocale={uiLocale}
        onTogglePlay={() => audio.toggle(track, ayah)}
        onSkipNext={audio.skipNext}
        onSkipPrevious={audio.skipPrevious}
        onSeek={audio.seekTo}
        onDismiss={audio.stop}
      />
      {/* No reciter picker and no continuous toggle: both are settings, and
          this bar exists to get you back to a recitation rather than to
          configure one. The screen that started it still owns those. */}
    </View>
  );
}
