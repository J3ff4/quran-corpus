import { Pressable, View, type StyleProp, type TextStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdjacentNavButton } from './AdjacentNav';
import { GlassSurface } from './GlassSurface';
import { SearchHeaderButton } from './SearchHeaderButton';
import { SegmentedControl } from './SegmentedControl';
import { Icon } from './icons/Icon';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import type { ReaderMode } from '@/settings/settingsStore';
import { fonts, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** The chip's values: the two real modes plus the door to word-by-word.
 *
 *  'wbw' is deliberately NOT a ReaderMode. It is a navigation, and the type
 *  keeps that distinction where the compiler can see it -- `onChangeMode`
 *  cannot be handed 'wbw' by accident. */
type ModeChipValue = ReaderMode | 'wbw';

export interface ReaderHeaderProps {
  /** Transliterated surah name, shown once the list's own heading scrolls off. */
  surahName: string;
  /** The scroll-linked fade, authored in SurahReader where the offset lives.
   *  Passed in rather than computed here so this component stays a pure
   *  renderer and the reader keeps one source of truth for the scroll. */
  titleStyle?: StyleProp<TextStyle>;
  mode: ReaderMode;
  onChangeMode: (mode: ReaderMode) => void;
  onOpenWbw: () => void;
  onOpenLanguage: () => void;
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
 * Two rows, where the mockup draws one. The mockup's chip has two segments and
 * no search or globe beside it; ours has three plus both actions, and five
 * controls in a 390pt row leaves the name about 34pt. The bar stays a single
 * surface, so it still reads as one piece of chrome.
 */
export function ReaderHeader({
  surahName,
  titleStyle,
  mode,
  onChangeMode,
  onOpenWbw,
  onOpenLanguage,
  onOpenSearch,
  onBack,
  uiLocale,
  prevSurahId,
  nextSurahId,
  onPageSurah,
}: ReaderHeaderProps) {
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();

  const options = [
    { value: 'mushaf', label: t(uiLocale, 'reader.modeMushaf') },
    { value: 'translation', label: t(uiLocale, 'reader.modeTranslation') },
    { value: 'wbw', label: t(uiLocale, 'reader.modeWbw') },
  ] as const satisfies readonly { value: ModeChipValue; label: string }[];

  return (
    // The inset lives outside the glass, not as padding inside it: a bar that
    // starts under the status bar and pads its own content down draws a tinted
    // strip behind the clock.
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8 }}>
      <GlassSurface radius="card" style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 10 }}>
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
          {/* Flanking the name (D47), the same control the dictionary entries
              page with. Paging is state, not navigation, so the button hands
              back the surah it means and the screen above changes to it. */}
          {onPageSurah ? (
            <AdjacentNavButton
              side="prev"
              target={prevSurahId ? String(prevSurahId) : null}
              onNavigate={(target, side) => onPageSurah(Number(target), side)}
              uiLocale={uiLocale}
              testIDPrefix="surah"
            />
          ) : null}
          {/* Always mounted, at opacity 0 while the list's heading is on
              screen: TalkBack then always has the surah name in the bar, which
              is what a screen reader wants, and the fade costs no re-render. */}
          <Animated.Text
            testID="reader-title"
            numberOfLines={1}
            style={[
              titleStyle,
              {
                flex: 1,
                textAlign: 'center',
                color: theme.text,
                fontFamily: fonts.display,
                fontSize: typography.body,
              },
            ]}
          >
            {surahName}
          </Animated.Text>
          {onPageSurah ? (
            <AdjacentNavButton
              side="next"
              target={nextSurahId ? String(nextSurahId) : null}
              onNavigate={(target, side) => onPageSurah(Number(target), side)}
              uiLocale={uiLocale}
              testIDPrefix="surah"
            />
          ) : null}
          {/* Both actions close the word sheet before they act -- see the
              handlers in SurahReader. This button sits above the sheet's
              backdrop, so leaving it mounted holds the ayah list at
              no-hide-descendants behind whatever opens next. */}
          <SearchHeaderButton uiLocale={uiLocale} onPress={onOpenSearch} />
          <Pressable
            testID="open-language"
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'reader.chooseLanguage')}
            onPress={onOpenLanguage}
            style={{
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="translate" color={theme.accent} />
          </Pressable>
        </View>
        <SegmentedControl
          options={options}
          value={mode}
          accessibilityLabel={t(uiLocale, 'reader.mode')}
          onChange={(next) => {
            // Decision 17: both word-by-word doors reach one screen. Rendering
            // a third mode inline would be a second WBW implementation to keep
            // in step with /surah/[id]/words, and persisting 'wbw' would
            // reopen the app onto a screen the user left by pressing back.
            if (next === 'wbw') {
              onOpenWbw();
              return;
            }
            onChangeMode(next);
          }}
        />
      </GlassSurface>
    </View>
  );
}
