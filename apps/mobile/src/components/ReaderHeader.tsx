import { useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdjacentNavButton } from './AdjacentNav';
import { Collapsible } from './Collapsible';
import { GlassSurface } from './GlassSurface';
import { SearchHeaderButton } from './SearchHeaderButton';
import { SegmentedControl } from './SegmentedControl';
import { Icon } from './icons/Icon';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import { fonts, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** The chip's values. Neither is a mode any more: since M7d the mushaf is its
 *  own tab (ruling 2) and this reader has one rendering, so the chip is the
 *  rendering it is showing and the door to word-by-word beside it. */
type ModeChipValue = 'translation' | 'wbw';

export interface ReaderHeaderProps {
  /** Transliterated surah name, shown once the list's own heading scrolls off. */
  surahName: string;
  /** The scroll-linked fade, authored in SurahReader where the offset lives.
   *  Passed in rather than computed here so this component stays a pure
   *  renderer and the reader keeps one source of truth for the scroll. */
  titleStyle?: StyleProp<ViewStyle>;
  /** Whether the name has faded in. It is the same scroll offset that drives
   *  `titleStyle`, computed once in SurahReader: a second threshold here would
   *  be a second source of truth for one fade. */
  titleVisible?: boolean;
  /** Omitted, the name is a label again and takes no presses. */
  onOpenJump?: () => void;
  onOpenWbw: () => void;
  onOpenLanguage: () => void;
  /** Whether the cards draw their translation, and the language picker beside
   *  its switch. */
  showTranslation?: boolean;
  onChangeShowTranslation?: (show: boolean) => void;
  onOpenSearch: () => void;
  onBack: () => void;
  uiLocale: UiLocaleCode;
  /** The surah either side of this one in mushaf order, or null at 1 and 114.
   *  Numbers rather than a boolean pair, so the header hands the caller the
   *  surah it means and nothing downstream re-derives it. */
  prevSurahId?: number | null;
  nextSurahId?: number | null;
  /** Omitted draws no chevrons at all: a header with two dead controls is
   *  worse than one without them. */
  onPageSurah?: (surahId: number, side: 'prev' | 'next') => void;
}

/**
 * The reader's whole top bar: back, the surah name, the mode chip, and the
 * search and language actions.
 *
 * It replaces the native header rather than sitting inside it (owner ruling,
 * 2026-08-25, mockup `1e`): the bar is one glass surface with the bloom
 * showing through, which a native toolbar cannot be. Everything the toolbar
 * used to provide is therefore this component's job now -- the back
 * affordance, and the surah name that fades in as the list's heading leaves.
 *
 * **Three rows, and the name owns the first one** (owner, device screenshot,
 * 2026-09-11, rulings R1/R2/R4). Seven controls shared that row before this:
 * back, two surah chevrons, the name, search, the translation switch and the
 * globe. On a 390pt frame that left the name about 34pt -- 'Al-B...' for
 * Al-Baqarah -- which the previous note in this docstring conceded and left
 * standing. So:
 *
 * 1. back, the name at `typography.title`, and one actions button;
 * 2. the two surah chevrons flanking the mode pill, which is the row that was
 *    already there and had room for them;
 * 3. search, the translation switch and the globe, in a curtain the actions
 *    button unrolls.
 *
 * The three actions cost a tap now. That is the owner's ruling (R1) and it
 * buys the name its row; an inline curtain rather than a sheet (R4) so
 * nothing covers the verses and the row stays part of this one glass surface.
 */
export function ReaderHeader({
  surahName,
  titleStyle,
  titleVisible = false,
  onOpenJump,
  onOpenWbw,
  onOpenLanguage,
  showTranslation = true,
  onChangeShowTranslation,
  onOpenSearch,
  onBack,
  uiLocale,
  prevSurahId,
  nextSurahId,
  onPageSurah,
}: ReaderHeaderProps) {
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  const [actionsOpen, setActionsOpen] = useState(false);

  const options = [
    { value: 'translation', label: t(uiLocale, 'reader.modeTranslation') },
    // A door, not a state: pressing it leaves for /surah/[id]/words. Marked so
    // the wash springs back instead of parking on a segment this screen will
    // never be -- see SegmentedControl's `door`.
    { value: 'wbw', label: t(uiLocale, 'reader.modeWbw'), door: true },
  ] as const satisfies readonly { value: ModeChipValue; label: string; door?: boolean }[];

  return (
    // The inset lives outside the glass, not as padding inside it: a bar that
    // starts under the status bar and pads its own content down draws a tinted
    // strip behind the clock.
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8 }}>
      {/* No `gap` on the surface: the curtain below is a zero-height flex child
          while it is shut, and a gap would still be paid for it -- 10pt of
          dead space under the mode row whenever the actions are closed. The
          rows carry their own spacing instead. */}
      <GlassSurface radius="card" style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            testID="reader-back"
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'reader.back')}
            onPress={onBack}
            style={{
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="back" color={theme.text} />
          </Pressable>
          {/* Always mounted, at opacity 0 while the list's heading is on
              screen: TalkBack then always has the surah name in the bar, which
              is what a screen reader wants, and the fade costs no re-render.

              `title` (24) rather than `body` (16): the name is the only thing
              on this row now, and at 16 it read as a caption rather than as
              the screen's subject. At the top of a surah, where the fade has
              it at opacity 0, this row rests holding back and the actions
              button with an empty middle -- accepted, because taking the fade
              away would put the name in the bar and in the list heading at
              once (ruling recorded in the phase plan). */}
          {/* The name IS the jump control (ruling S3) -- and only while it is
              on screen. Faded out it is an invisible hit target across the
              middle of the bar, and TalkBack would offer a button for
              something the eye cannot see; the list's own heading carries the
              surah name at exactly that moment anyway.

              The Pressable wraps the name rather than replacing it:
              `titleStyle` still drives the fade, and the name is still always
              mounted so a screen reader never loses it. */}
          <Pressable
            testID="reader-surah-jump"
            accessibilityRole="button"
            // The NAME first, then what pressing it does. A Pressable is
            // `accessible` by default, which collapses its descendants -- so
            // the Animated.Text below is no longer announced and this label is
            // the entire utterance. Left as just the action, wrapping the name
            // in a control silently took the surah name away from TalkBack,
            // which is the opposite of what the note above promises.
            accessibilityLabel={`${surahName}, ${t(uiLocale, 'jump.surahTitle')}`}
            disabled={!titleVisible || !onOpenJump}
            accessibilityElementsHidden={!titleVisible}
            importantForAccessibility={titleVisible ? 'auto' : 'no-hide-descendants'}
            onPress={onOpenJump}
            style={{ flex: 1 }}
          >
            {/* The caret is the affordance (owner, 2026-09-12): a tappable
                name with nothing to say so is a control nobody finds, and the
                word-by-word header has carried one since M6e. It sits inside
                the faded View rather than beside it, so it disappears with the
                name -- a caret left behind over an invisible name would point
                at a control that is not taking presses.

                A row View wrapping the text, not two siblings: `titleStyle`
                drives one opacity for both, and the name stays centred with
                the caret trailing it rather than the pair being centred as a
                block, which walked the name off-centre by half the caret. */}
            <Animated.View
              style={[
                titleStyle,
                { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
              ]}
            >
              <Text
                testID="reader-title"
                numberOfLines={1}
                style={{
                  textAlign: 'center',
                  color: theme.text,
                  fontFamily: fonts.display,
                  fontSize: typography.title,
                  flexShrink: 1,
                }}
              >
                {surahName}
              </Text>
              {onOpenJump ? <Icon name="chevronDown" size={14} color={theme.mutedText} /> : null}
            </Animated.View>
          </Pressable>
          {/* One button for three actions (ruling R1). A kebab: not a gear,
              because Settings is a real screen here and a gear would promise
              it, and not `menu`, whose three lines are Android's nav-drawer
              glyph and promised a drawer (owner, device, 2026-09-11). */}
          <Pressable
            testID="reader-actions"
            accessibilityRole="button"
            accessibilityState={{ expanded: actionsOpen }}
            accessibilityLabel={t(uiLocale, actionsOpen ? 'reader.hideActions' : 'reader.showActions')}
            onPress={() => setActionsOpen((open) => !open)}
            style={{
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={actionsOpen ? 'close' : 'kebab'} color={theme.text} />
          </Pressable>
        </View>
        {/* Flanking the pill (R2), not the name (D47): the chevrons page the
            surah, and this is the row with width to spare. Paging is state,
            not navigation, so the button hands back the surah it means and the
            screen above changes to it. */}
        <View
          testID="reader-mode-row"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}
        >
          {onPageSurah ? (
            <AdjacentNavButton
              side="prev"
              target={prevSurahId ? String(prevSurahId) : null}
              onNavigate={(target, side) => onPageSurah(Number(target), side)}
              uiLocale={uiLocale}
              testIDPrefix="surah"
            />
          ) : null}
          <View style={{ flex: 1 }}>
            <SegmentedControl
              options={options}
              // Always the rendering on screen: the other chip is a door, not a
              // state, so nothing here can move it.
              value="translation"
              accessibilityLabel={t(uiLocale, 'reader.mode')}
              onChange={(next) => {
                // Decision 17: both word-by-word doors reach one screen.
                // Rendering it inline would be a second WBW implementation to
                // keep in step with /surah/[id]/words, and persisting it would
                // reopen the app onto a screen the user left by pressing back.
                if (next === 'wbw') onOpenWbw();
              }}
            />
          </View>
          {onPageSurah ? (
            <AdjacentNavButton
              side="next"
              target={nextSurahId ? String(nextSurahId) : null}
              onNavigate={(target, side) => onPageSurah(Number(target), side)}
              uiLocale={uiLocale}
              testIDPrefix="surah"
            />
          ) : null}
        </View>
        {/* Both actions close the word sheet before they act -- see the
            handlers in SurahReader. These sit above the sheet's backdrop, so
            leaving them mounted holds the ayah list at no-hide-descendants
            behind whatever opens next; the curtain unmounts them when shut,
            which is the same guarantee by a shorter route. */}
        <Collapsible open={actionsOpen} testID="reader-actions-row">
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              paddingTop: 4,
            }}
          >
            {onChangeShowTranslation ? (
              <Pressable
                testID="toggle-translation"
                accessibilityRole="switch"
                // The state, not just the label: the glyph is the only other
                // difference, and colour alone is not an announcement.
                accessibilityState={{ checked: showTranslation }}
                accessibilityLabel={t(uiLocale, 'reader.showTranslationLabel')}
                onPress={() => onChangeShowTranslation(!showTranslation)}
                style={{
                  minHeight: touchTargets.minimum,
                  minWidth: touchTargets.minimum,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* The glyph itself carries the state, not only its colour
                    (WCAG 1.4.1): OFF is the same mark struck through. */}
                <Icon
                  name={showTranslation ? 'translate' : 'translateOff'}
                  color={showTranslation ? theme.accent : theme.mutedText}
                />
              </Pressable>
            ) : null}
            <SearchHeaderButton uiLocale={uiLocale} onPress={onOpenSearch} />
            {/* Always here, translation on or off (owner, 2026-09-12). It used
                to be hidden while the translation was off, on the rule that a
                picker changing nothing visible is a dead control -- but a
                control that vanishes reflows the row under the thumb and
                leaves no way to say "show me this in Uzbek" in one move. It is
                not dead now: picking a language while the translation is off
                turns the translation back on, so the choice is always visible
                the moment it is made. */}
            <Pressable
              testID="open-language"
              accessibilityRole="button"
              accessibilityLabel={t(uiLocale, 'reader.chooseLanguage')}
              onPress={() => {
                if (!showTranslation) onChangeShowTranslation?.(true);
                onOpenLanguage();
              }}
              style={{
                minHeight: touchTargets.minimum,
                minWidth: touchTargets.minimum,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="globe" color={theme.accent} />
            </Pressable>
          </View>
        </Collapsible>
      </GlassSurface>
    </View>
  );
}
