import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GlassSurface } from '@/components/GlassSurface';
import { ReciterSheet } from '@/components/ReciterSheet';
import { PlayerShell } from '@/components/PlayerShell';
import { RecitationBar } from '@/components/RecitationBar';
import { Icon } from '@/components/icons/Icon';
import { useRecitationController } from '@/audio/recitationContext';
import type { ReaderLocation } from '@/data/corpusRepository';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { reciterById } from '@quran-corpus/data/mobile';
import { useAppSettings } from '@/settings/settingsStore';
import { fonts, touchTargets, typography } from '@/theme/tokens';
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
  const { setReciterId } = useAppSettings();
  const [reciterOpen, setReciterOpen] = useState(false);

  const mine = audio.track?.owner === 'home';
  // Any owner's sound, not only this card's (owner, 2026-09-15). The mini-
  // player is suppressed on this tab, so a card that stayed a resting line
  // while the mushaf recited left the whole screen with no way to pause what
  // it could hear.
  const sounding = audio.playing;
  const reciterLabel = reciterById(reciterId)?.label ?? '';
  // The count is what stops continuous play at the end of the surah, and it
  // arrives with the corpus read. Starting without it would run a recitation
  // with nowhere to stop, so the control waits rather than starting something
  // it cannot finish.
  //
  // And only when it is THIS surah's read. The query keeps the previous
  // result while a new coordinate resolves, so a card already showing the new
  // surahId would otherwise start it under the old surah's name and count.
  const loaded = location !== null && location.surah.id === surahId ? location : null;
  const ayahCount = loaded?.surah.ayah_count ?? 0;

  // The live ayah while this card owns the sound, the stored one otherwise.
  //
  // Continuous play walks past the ayah this card was rendered with, so a
  // Pause on the grown bar that passed the PROP would not match the playhead
  // and would restart the last-read ayah instead of pausing -- jumping the
  // recitation backwards on the one control that is supposed to hold it still.
  function start() {
    // Mirroring another screen's recitation: the control pauses THAT, rather
    // than starting this card's own track over the top of it. Taking over is
    // what the resting card's play control does, and this pause is what puts
    // that control back on screen.
    const live = audio.track;
    if (!mine && live !== null && audio.playing && audio.ayah !== null) {
      audio.toggle(live, audio.ayah);
      return;
    }
    if (ayahCount === 0) return;
    const target = mine && audio.ayah !== null ? audio.ayah : ayahNumber;
    audio.toggle(
      {
        owner: 'home',
        surahId,
        ayahCount,
        surahName: loaded?.surah.name_translit ?? '',
        // Always, regardless of the saved setting (ruling 9). This is a resume-
        // listening control, not a per-ayah one: the setting exists for the
        // reader, where "just this ayah" is a coherent thing to ask of a
        // control sitting on that ayah's own card.
        continuous: true,
      },
      target,
    );
  }

  return (
    <View testID="home-player">
      {/* A failed load takes `playing` false, which shrinks this card straight
          back to its resting line -- so without this the tap simply does
          nothing and says nothing. The reader announces its own the same way. */}
      {mine && audio.error ? (
        <Text
          testID="home-player-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ color: theme.danger, fontSize: typography.caption, marginBottom: 8 }}
        >
          {t(uiLocale, audio.error)}
        </Text>
      ) : null}
      <PlayerShell
        expanded={sounding}
        growMs={reducedMotion ? 0 : GROW_MS}
        full={
          <RecitationBar
            dock={false}
            ayahNumber={audio.ayah}
            surahName={audio.track?.surahName}
            playing={audio.playing}
            positionSec={audio.positionSec}
            durationSec={audio.durationSec}
            reciterLabel={reciterLabel}
            uiLocale={uiLocale}
            onTogglePlay={start}
            onSkipNext={audio.skipNext}
            onSkipPrevious={audio.skipPrevious}
            onSeek={audio.seekTo}
            onOpenReciters={() => setReciterOpen(true)}
          />
        }
        compact={
          // A card, not the floating pill it was: it sits in a stack of cards
          // and the odd one out read as something dropped on the screen rather
          // than part of it (owner, 2026-09-15). Same surface, padding and
          // gap as ContinueCard.
          //
          // The surah, not the reciter. What is being recited is the fact this
          // line exists to carry; the voice is a setting, and it is named on
          // the transport this grows into -- where it is also the control that
          // changes it.
          <GlassSurface style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 6 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
                {t(uiLocale, 'home.listen')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.text,
                    fontFamily: fonts.displaySemiBold,
                    fontSize: typography.body,
                    flexShrink: 1,
                  }}
                >
                  {loaded?.surah.name_translit ?? ''}
                </Text>
                <Text style={{ color: theme.accent, fontSize: typography.caption }}>
                  {surahId}:{ayahNumber}
                </Text>
              </View>
            </View>
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
      {reciterOpen ? (
        <ReciterSheet
          current={reciterId}
          uiLocale={uiLocale}
          // The playhead is left alone, as on the mushaf: the engine reloads
          // the source under the new voice at the next press, and a picker
          // that restarted the ayah would punish browsing the list.
          onSelect={setReciterId}
          onClose={() => setReciterOpen(false)}
        />
      ) : null}
    </View>
  );
}
