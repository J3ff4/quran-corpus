import { Pressable, Text, View } from 'react-native';

import { GlassSurface } from './GlassSurface';
import { Icon, type IconName } from './icons/Icon';
import { t, type UiStringKey } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/**
 * The slice of expo-router's BottomTabBarProps this bar actually reads.
 *
 * Structural rather than imported: the type lives behind
 * `expo-router/build/react-navigation/...`, whose public re-export is already
 * marked deprecated in favour of `expo-router/js-tabs`. Naming only what is
 * used keeps this file out of that migration, and keeps the test's fixture
 * honest -- a full BottomTabBarProps stub would be mostly invented.
 */
export interface GlassTabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    navigate: (name: string) => void;
    // `type` is a literal, not a string: react-navigation types emit() against
    // its event map, so a widened `string` is rejected at the call site in
    // app/(tabs)/_layout.tsx rather than here, where the mistake is.
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
  };
  insets: { bottom: number };
}

/** Route name -> glyph and label. Keyed by route so a reordered <Tabs> cannot
 *  silently pair the wrong icon with the wrong screen. */
const TABS: Record<string, { icon: IconName; label: UiStringKey }> = {
  index: { icon: 'home', label: 'tabs.home' },
  surahs: { icon: 'book', label: 'tabs.surahs' },
  morphology: { icon: 'words', label: 'tabs.morphology' },
  dictionary: { icon: 'dictionary', label: 'tabs.dictionary' },
  menu: { icon: 'menu', label: 'tabs.menu' },
};

/**
 * The floating glass pill that replaces the default tab bar.
 *
 * Rendered as `tabBar` rather than styled through `tabBarStyle`: the design
 * floats it clear of the screen edge with the bloom visible underneath, and
 * `tabBarStyle` can only recolour a bar that is still a full-width opaque strip
 * pinned to the bottom.
 *
 * Insets come from the navigator's own props rather than useSafeAreaInsets --
 * the navigator has already resolved them, and reading them twice is how the
 * bar and the screen under it end up disagreeing by a few points.
 */
export function GlassTabBar({ state, navigation, insets }: GlassTabBarProps) {
  const theme = useThemeColors();
  const { uiLocale } = useAppSettings();

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12 }}
    >
      <GlassSurface docked radius="pill" style={{ flexDirection: 'row', paddingVertical: 6 }}>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t(uiLocale, tab.label)}
              onPress={() => {
                // emit() first so a screen listening for tabPress can cancel it
                // -- the reader uses that to scroll to top rather than throw its
                // position away by re-navigating.
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                minHeight: touchTargets.minimum,
              }}
            >
              <Icon name={tab.icon} color={focused ? theme.accent : theme.mutedText} size={22} />
              <Text
                testID={`tab-${route.name}-label`}
                numberOfLines={1}
                style={{
                  color: focused ? theme.accent : theme.mutedText,
                  fontSize: typography.caption - 2,
                }}
              >
                {t(uiLocale, tab.label)}
              </Text>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}
