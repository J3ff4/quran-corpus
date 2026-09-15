import { Pressable, Text, View } from 'react-native';

import { GlassSurface } from '@/components/GlassSurface';
import { PlayerShell } from '@/components/PlayerShell';
import { RecitationBar } from '@/components/RecitationBar';
import { Icon } from '@/components/icons/Icon';
import { useRecitationController } from '@/audio/recitationContext';
import type { ReaderLocation } from '@/data/corpusRepository';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { reciterById } from '@quran-corpus/data/mobile';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** Matches the mushaf's player, so one grow means one thing across the app. */
const GROW_MS = 280;

export interface HomePlayerCardProps {
  surahId: number;
  ayahNumber: number;
  /** Null while the corpus read is in flight. The play control waits for it --
   *  see below. */
  location: ReaderLocation | null;
  reciterId: string;
  uiLocale: UiLocaleCode;
}

/**
 * Pick up the recitation where the reading stopped.
 *
 * Its own card under Continue reading (ruling 7) rather than a play glyph on
 * that card: Continue is the way back into the READER, and a control that
 * starts a sound without going anywhere is a different promise.
 *
 * It grows in place while it sounds (ruling 8), which is why the mini-player
 * suppresses itself on this tab -- two transports on one screen would be two
 * answers to the question of what is playing.
 */
export function HomePlayerCard({
  surahId,
  ayahNumber,
  location,
  reciterId,
  uiLocale,
}: HomePlayerCardProps) {
  const theme = useThemeColors();
  const audio = useRecitationController();
  const reducedMotion = useReducedMotion();

  const mine = audio.track?.owner === 'home';
  const sounding = mine && audio.playing;
  const reciterLabel = reciterById(reciterId)?.label ?? '';
  // The count is what stops continuous play at the end of the surah, and it
  // arrives with the corpus read. Starting without it would run a recitation
  // with nowhere to stop, so the control waits rather than starting something
  // it cannot finish.
  const ayahCount = location?.surah.ayah_count ?? 0;

  function start() {
    if (ayahCount === 0) return;
    audio.toggle(
      {
        owner: 'home',
        surahId,
        ayahCount,
        surahName: location?.surah.name_translit ?? '',
        // Always, regardless of the saved setting (ruling 9). This is a resume-
        // listening control, not a per-ayah one: the setting exists for the
        // reader, where "just this ayah" is a coherent thing to ask of a
        // control sitting on that ayah's own card.
        continuous: true,
      },
      ayahNumber,
    );
  }

  return (
    <View testID="home-player">
      <PlayerShell
        expanded={sounding}
        growMs={reducedMotion ? 0 : GROW_MS}
        full={
          <RecitationBar
            dock={false}
            ayahNumber={audio.ayah}
            playing={audio.playing}
            positionSec={audio.positionSec}
            durationSec={audio.durationSec}
            reciterLabel={reciterLabel}
            uiLocale={uiLocale}
            onTogglePlay={start}
            onSkipNext={audio.skipNext}
            onSkipPrevious={audio.skipPrevious}
            onSeek={audio.seekTo}
          />
        }
        compact={
          <GlassSurface
            docked
            radius="pill"
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}
          >
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: theme.mutedText, fontSize: typography.caption }}
            >
              {t(uiLocale, 'home.listen')} · {reciterLabel}
            </Text>
            <Pressable
              testID="home-player-play"
              accessibilityRole="button"
              // The coordinate, not a bare "Play": this control starts a
              // specific ayah, and on a screen of four cards that is the fact
              // worth announcing.
              accessibilityLabel={`${t(uiLocale, 'reader.play')} ${surahId}:${ayahNumber}`}
              accessibilityState={{ disabled: ayahCount === 0 }}
              disabled={ayahCount === 0}
              onPress={start}
              style={{
                minHeight: touchTargets.minimum,
                minWidth: touchTargets.minimum,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="play" color={ayahCount === 0 ? theme.mutedText : theme.accent} size={22} />
            </Pressable>
          </GlassSurface>
        }
      />
    </View>
  );
}
