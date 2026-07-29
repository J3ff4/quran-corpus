import { Tabs } from 'expo-router';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { colors } from '@/theme/tokens';

export default function TabsLayout() {
  const { uiLocale } = useAppSettings();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t(uiLocale, 'tabs.home') }} />
      <Tabs.Screen name="surahs" options={{ title: t(uiLocale, 'tabs.surahs') }} />
      <Tabs.Screen name="bookmarks" options={{ title: t(uiLocale, 'tabs.bookmarks') }} />
      <Tabs.Screen name="settings" options={{ title: t(uiLocale, 'tabs.settings') }} />
    </Tabs>
  );
}
