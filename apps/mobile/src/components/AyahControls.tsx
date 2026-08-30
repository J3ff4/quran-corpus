import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useBookmarkPulse, useNoteReveal } from '@/motion/bookmarkReveal';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { Icon } from './icons/Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Without a size floor the tap target is only the glyph box -- under the 24x24
// of WCAG 2.2 SC 2.5.8 and far under Android's 48dp, on the reader's two
// primary actions.
const pressableStyle = {
  minHeight: touchTargets.minimum,
  minWidth: touchTargets.minimum,
  justifyContent: 'center',
  alignItems: 'center',
} as const;

export interface AyahControlsProps {
  surahId: number;
  ayahNumber: number;
  bookmarked: boolean;
  /** This ayah's note, or null for none. Only ever non-null on a bookmarked
   *  ayah -- a note is an attribute of a bookmark. */
  note?: string | null;
  playing: boolean;
  uiLocale: UiLocaleCode;
  audioDisabled?: boolean;
  /** Mushaf mode draws them a point smaller: there the controls sit under the
   *  Arabic run at low emphasis rather than in a card header. */
  size?: number;
  onToggleBookmark: (ayahNumber: number) => void;
  /** Optional and explicitly undefined-able: both renderers take it as an
   *  optional prop of their own and forward it straight through, which under
   *  exactOptionalPropertyTypes is a `| undefined`, not an absent key. */
  onEditNote?: ((ayahNumber: number) => void) | undefined;
  onToggleAudio: (ayahNumber: number) => void;
}

/**
 * The reader's three controls: bookmark, note, play.
 *
 * One component for both renderers, not because they look alike but because
 * they must not drift: mushaf mode and translation mode differ in what you
 * SEE, never in what you can DO, and the two copies this replaces had already
 * been edited in lockstep three times.
 *
 * Icons, not words. As labels this row was locale-sized: "Bookmark · Play"
 * fits, "Удалить закладку · Воспроизвести" does not, and the Play control was
 * clipped clean off the card edge on device (2026-08-29) because GlassSurface
 * hides its overflow. Three glyphs are the same width in every locale.
 */
export function AyahControls({
  surahId,
  ayahNumber,
  bookmarked,
  note = null,
  playing,
  uiLocale,
  audioDisabled = false,
  size = 21,
  onToggleBookmark,
  onEditNote,
  onToggleAudio,
}: AyahControlsProps) {
  const theme = useThemeColors();
  const reveal = useNoteReveal();
  const pulse = useBookmarkPulse(bookmarked);

  return (
    // `layout` on the row, and again on the audio control below: the row is
    // right-aligned, so admitting the pen moves the row's own left edge, and
    // the bookmark rides it. See useNoteReveal.
    <Animated.View layout={reveal.layout} style={{ flexDirection: 'row', gap: 4 }}>
      <Pressable
        // Both renderers give their bookmark this testID: the reader swaps
        // renderers by mode, and a test that reaches for one handle has to
        // find whichever renderer is mounted.
        testID={`ayah-${surahId}-${ayahNumber}-bookmark`}
        accessibilityRole="button"
        accessibilityState={{ selected: bookmarked }}
        // The wording the glyph replaced. It was the button's accessible name
        // when it was visible text; naming it explicitly is what keeps
        // TalkBack saying the same thing now that it is a shape.
        accessibilityLabel={bookmarked ? t(uiLocale, 'reader.removeBookmark') : t(uiLocale, 'reader.bookmark')}
        onPress={() => onToggleBookmark(ayahNumber)}
        style={pressableStyle}
      >
        {/* The swell is on a View around the glyph, never on the Pressable:
            the Pressable is the 48dp target, and scaling it would move the
            target under the finger still on it. */}
        <Animated.View style={pulse}>
          {/* Filled when saved, outline when not. State cannot ride on the
              accent alone (WCAG 1.4.1) -- the wording used to be the second
              channel and the fill is what replaces it. */}
          <Icon
            testID={`ayah-${surahId}-${ayahNumber}-bookmark-icon`}
            name="bookmark"
            filled={bookmarked}
            color={bookmarked ? theme.accent : theme.mutedText}
            size={size}
          />
        </Animated.View>
      </Pressable>
      {/* Only on a bookmarked ayah. setBookmarkNote is an UPDATE, never an
          upsert, so a note written against an unbookmarked ayah would land
          nowhere -- an affordance that silently does nothing. */}
      {bookmarked && onEditNote ? (
        <AnimatedPressable
          entering={reveal.entering}
          exiting={reveal.exiting}
          testID={`ayah-${surahId}-${ayahNumber}-note`}
          accessibilityRole="button"
          // The two states differ by label, not by colour alone: the icon
          // itself says nothing to TalkBack.
          accessibilityLabel={t(uiLocale, note === null ? 'bookmarks.addNote' : 'bookmarks.editNote')}
          onPress={() => onEditNote(ayahNumber)}
          style={pressableStyle}
        >
          <Icon
            testID={`ayah-${surahId}-${ayahNumber}-note-icon`}
            name="note"
            filled={note !== null}
            color={note === null ? theme.mutedText : theme.accent}
            size={size}
          />
        </AnimatedPressable>
      ) : null}
      <AnimatedPressable
        // The row's origin travels left by exactly what this control's offset
        // inside the row gains, so animating both leaves it standing still.
        // Without this it is carried left with the row and then snaps back.
        layout={reveal.layout}
        testID={`ayah-${surahId}-${ayahNumber}-audio`}
        accessibilityRole="button"
        // Without this TalkBack announces an ordinary button whose press does
        // nothing when audio is unconfigured.
        accessibilityState={{ disabled: audioDisabled }}
        accessibilityLabel={playing ? t(uiLocale, 'reader.pause') : t(uiLocale, 'reader.play')}
        disabled={audioDisabled}
        onPress={() => onToggleAudio(ayahNumber)}
        style={pressableStyle}
      >
        <Icon
          testID={`ayah-${surahId}-${ayahNumber}-audio-icon`}
          // Play is a solid triangle, pause two bars -- the standard pair. An
          // outline triangle at this size reads as a chevron.
          name={playing ? 'pause' : 'play'}
          filled={!playing}
          color={audioDisabled ? theme.mutedText : theme.accent}
          size={size}
        />
      </AnimatedPressable>
    </Animated.View>
  );
}

