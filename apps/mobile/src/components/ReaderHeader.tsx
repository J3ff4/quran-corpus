import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { AdjacentNavButton } from './AdjacentNav';
import { HeaderCard } from './HeaderCard';
import { SearchHeaderButton } from './SearchHeaderButton';
import { SegmentedControl } from './SegmentedControl';
import { Icon } from './icons/Icon';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import { touchTargets } from '@/theme/tokens';
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
 * The card itself is HeaderCard, shared with the morphology screen: the three
 * rows, the glass, the fade and every ruling behind them live there now. What
 * stays here is what only the reader has -- the surah chevrons around the mode
 * pill, and the translation switch, search and globe in the curtain.
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

  const options = [
    { value: 'translation', label: t(uiLocale, 'reader.modeTranslation') },
    // A door, not a state: pressing it leaves for /surah/[id]/words. Marked so
    // the wash springs back instead of parking on a segment this screen will
    // never be -- see SegmentedControl's `door`.
    { value: 'wbw', label: t(uiLocale, 'reader.modeWbw'), door: true },
  ] as const satisfies readonly { value: ModeChipValue; label: string; door?: boolean }[];

  return (
    <HeaderCard
      title={surahName}
      {...(titleStyle ? { titleStyle } : {})}
      titleVisible={titleVisible}
      // The name IS the jump control (ruling S3) -- and only while it is on
      // screen. The list's own heading carries the surah name at exactly the
      // moment this one is faded out.
      {...(onOpenJump ? { onTitlePress: onOpenJump } : {})}
      // The NAME first, then what pressing it does: this is the whole
      // utterance, so leading with the action would silently take the surah
      // name away from TalkBack.
      titleAccessibilityLabel={`${surahName}, ${t(uiLocale, 'jump.surahTitle')}`}
      onBack={onBack}
      uiLocale={uiLocale}
      testIDPrefix="reader"
      middleRow={
        /* Flanking the pill (R2), not the name (D47): the chevrons page the
           surah, and this is the row with width to spare. Paging is state, not
           navigation, so the button hands back the surah it means and the
           screen above changes to it.

           `marginTop` rather than a container `gap` -- see HeaderCard. */
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
      }
      actions={
        /* Both actions close the word sheet before they act -- see the
           handlers in SurahReader. These sit above the sheet's backdrop, so
           leaving them mounted holds the ayah list at no-hide-descendants
           behind whatever opens next; the curtain unmounts them when shut,
           which is the same guarantee by a shorter route. */
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
          {/* Always here, translation on or off (owner, 2026-09-12). It used to
              be hidden while the translation was off, on the rule that a picker
              changing nothing visible is a dead control -- but a control that
              vanishes reflows the row under the thumb and leaves no way to say
              "show me this in Uzbek" in one move. It is not dead now: picking a
              language while the translation is off turns the translation back
              on, so the choice is always visible the moment it is made. */}
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
      }
    />
  );
}
