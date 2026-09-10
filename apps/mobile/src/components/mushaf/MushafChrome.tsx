import { Pressable, Text } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/GlassSurface';
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
/** Was 8. The bar sits just under the status bar now (owner, 2026-09-10). */
const TOP_GAP = 2;

export interface MushafChromeProps {
  visible: boolean;
  uiLocale: UiLocaleCode;
  onOpenJump: () => void;
  onOpenSearch: () => void;
}

/**
 * The mushaf's whole chrome: a jump control and a search button.
 *
 * No identity row (ruling 6). The surah name, the juz and the page number are
 * printed on the page itself now (ruling 9), so a bar that repeated them would
 * be saying twice what the page already says once -- and saying it only while
 * the bar happens to be up.
 *
 * Opaque, not translucent. There is no backdrop-filter in React Native, and a
 * bar docked over scrollable content needs an opaque backing -- the lesson four
 * sub-phases of M6 kept re-learning.
 */
export function MushafChrome({ visible, uiLocale, onOpenJump, onOpenSearch }: MushafChromeProps) {
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
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
      <GlassSurface docked radius="card" style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
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
            {t(uiLocale, 'mushaf.jumpTitle')}
          </Text>
        </Pressable>
        <SearchHeaderButton uiLocale={uiLocale} onPress={onOpenSearch} />
      </GlassSurface>
    </Animated.View>
  );
}
