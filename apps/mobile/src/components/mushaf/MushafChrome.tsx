import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/GlassSurface';
import { SearchHeaderButton } from '@/components/SearchHeaderButton';
import { Icon } from '@/components/icons/Icon';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** Matches the tab bar's own travel, so the two leave together. */
const CHROME_FADE_MS = 220;
const BAR_TRAVEL = -80;

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

  const style = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration }),
    transform: [{ translateY: withTiming(visible ? 0 : BAR_TRAVEL, { duration }) }],
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
        { position: 'absolute', top: insets.top + 8, left: 16, right: 16 },
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
