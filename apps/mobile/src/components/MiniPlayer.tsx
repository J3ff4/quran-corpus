import { View } from 'react-native';
import { useSegments } from 'expo-router';

import { RecitationBar } from './RecitationBar';
import { useTabBarTop } from './GlassTabBar';
import { useRecitationController } from '@/audio/recitationContext';
import { reciterById } from '@quran-corpus/data/mobile';
import { useAppSettings } from '@/settings/settingsStore';

/** The tabs that already draw a transport of their own. */
const HAS_ITS_OWN_PLAYER = new Set(['mushaf', 'index']);

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
  const segments = useSegments();

  // Read before the guard so it narrows: the toggle below needs the track it
  // is resuming, and `audio.track` is a property TypeScript cannot know stays
  // non-null inside a closure.
  const track = audio.track;
  const ayah = audio.ayah;
  const tab = segments.at(-1);
  // The mushaf has its player, Home has its card (ruling 8). Two transports on
  // one screen is two answers to "what is playing".
  if (track === null || ayah === null || !audio.playing || (tab !== undefined && HAS_ITS_OWN_PLAYER.has(tab))) {
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
