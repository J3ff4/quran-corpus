import { Pressable, Text } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useStableInsets } from '@/theme/useStableInsets';
import { STRIP_ROW_HEIGHT } from './MushafTopStrip';

import { GlassSurface } from '@/components/GlassSurface';
import { centredContent } from '@/theme/contentWidth';
import { SearchHeaderButton } from '@/components/SearchHeaderButton';
import { Icon } from '@/components/icons/Icon';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** Matches the tab bar's own travel time, so the two leave together. */
const CHROME_FADE_MS = 220;
/** Tall enough to clear the top edge from wherever the bar is docked.
 *
 *  The bar used to travel a flat -80, which from `insets.top + 4` leaves a
 *  48dp bar still overlapping the screen when its opacity reaches 0. It
 *  therefore faded roughly in place while the tab bar slid its whole height
 *  out of frame, and the owner read the difference as the top bar "flipping"
 *  rather than sliding (2026-09-10). Derived from the inset instead, so the
 *  bar is genuinely gone by the time it is invisible. */
const BAR_HEIGHT = 56;
/** Was 8. The bar sits just under the status bar now (owner, 2026-09-10) --
 *  and, since 2026-09-15, under the strip that names the page: an opaque card
 *  docked over that row would hide the surah and the juz for as long as the
 *  chrome is up. */
const TOP_GAP = 2 + STRIP_ROW_HEIGHT;

export interface MushafChromeProps {
  visible: boolean;
  uiLocale: UiLocaleCode;
  onOpenJump: () => void;
  onOpenSearch: () => void;
  /** Is the page in front of the reader the khatm-marked one? Decides which
   *  way the button goes, in words as well as in what it does. */
  marked: boolean;
  onToggleMark: () => void;
  /** The stored mark could not be READ.
   *
   *  The button is disabled, because "unreadable" and "unmarked" look
   *  identical from here and only one of them is safe to act on: offering the
   *  mark over a failed read invites the reader to overwrite a khatm the
   *  database still holds, in a file that survives app updates. */
  markUnavailable: boolean;
}

/**
 * The mushaf's whole chrome: a jump control and a search button.
 *
 * No identity row (ruling 6). The page number is printed on the leaf and the
 * surah and juz sit in the strip above it, neither of which hides on a timer --
 * so a bar repeating them would say twice what is already said once, and say it
 * only while the bar happens to be up.
 *
 * Opaque, not translucent. There is no backdrop-filter in React Native, and a
 * bar docked over scrollable content needs an opaque backing -- the lesson four
 * sub-phases of M6 kept re-learning.
 */
export function MushafChrome({
  visible,
  uiLocale,
  onOpenJump,
  onOpenSearch,
  marked,
  onToggleMark,
  markUnavailable,
}: MushafChromeProps) {
  const theme = useThemeColors();
  // The bar is positioned off the status bar's inset and fades out as that
  // bar is hidden. Read live, the inset collapses to 0 mid-fade and the chrome
  // jumps up the screen on its way out.
  const insets = useStableInsets();
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? 0 : CHROME_FADE_MS;

  const travel = -(insets.top + TOP_GAP + BAR_HEIGHT);
  // A shared value driven from an effect, NOT `withTiming` called inside the
  // style worklet. Inside the worklet the animation is re-issued every time
  // the worklet re-evaluates -- which is every render of this component, and
  // the mushaf screen re-renders on every page turn, every press and every
  // recitation tick. Each re-issue restarts the timing curve from wherever the
  // bar had got to, with a fresh full duration, so a bar caught mid-move
  // visibly stutters. Issued from an effect it runs once per change.
  const progress = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration });
  }, [visible, duration, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * travel }],
  }));

  return (
    <Animated.View
      testID="mushaf-chrome"
      // Gone from touch and from TalkBack together with its opacity: a faded
      // bar across the top of the page would otherwise eat the tap meant to
      // bring it back, and a screen reader would still walk into it.
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        { position: 'absolute', top: insets.top + TOP_GAP, left: 16, right: 16 },
        style,
      ]}
    >
      {/* Capped and centred like the tab pill, and for the same reason: the
          positioned box above runs the full width between the screen margins,
          so on a 1400dp tablet this card was more than twice the pill's length
          (owner, 2026-10-02). The cap goes on the surface, never on the
          positioned box -- that box sets both `left` and `right`, so a maxWidth
          there shrinks it against the left edge instead of centring it. */}
      <GlassSurface
        docked
        radius="card"
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, ...centredContent }}
      >
        <Pressable
          testID="mushaf-open-jump"
          accessibilityRole="button"
          accessibilityLabel={t(uiLocale, 'mushaf.jump')}
          onPress={onOpenJump}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            minHeight: touchTargets.minimum,
            paddingHorizontal: 8,
          }}
        >
          <Icon name="book" color={theme.mutedText} size={18} />
          <Text numberOfLines={1} style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {t(uiLocale, 'jump.title')}
          </Text>
        </Pressable>
        {/* Before search, so the two page-level controls sit together and the
            search button keeps the trailing edge it has everywhere else. */}
        <Pressable
          testID="mushaf-ribbon-button"
          accessibilityRole="button"
          accessibilityLabel={t(uiLocale, marked ? 'mushaf.liftMark' : 'mushaf.markPage')}
          accessibilityState={{ disabled: markUnavailable }}
          disabled={markUnavailable}
          onPress={onToggleMark}
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: touchTargets.minimum,
            minWidth: touchTargets.minimum,
            // Dimmed rather than hidden: a control that disappears when a read
            // fails reads as a missing feature, and the reader has no way to
            // know the mark is still there.
            opacity: markUnavailable ? 0.4 : 1,
          }}
        >
          <Icon name="bookmark" color={marked ? theme.ribbon : theme.mutedText} size={18} />
        </Pressable>
        <SearchHeaderButton uiLocale={uiLocale} onPress={onOpenSearch} />
      </GlassSurface>
    </Animated.View>
  );
}
