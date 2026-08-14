import { Tabs } from 'expo-router';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { useThemeColors } from '@/theme/themeContext';

export default function TabsLayout() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.mutedText,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t(uiLocale, 'tabs.home') }} />
      <Tabs.Screen name="surahs" options={{ title: t(uiLocale, 'tabs.surahs') }} />
      <Tabs.Screen name="bookmarks" options={{ title: t(uiLocale, 'tabs.bookmarks') }} />
      <Tabs.Screen name="settings" options={{ title: t(uiLocale, 'tabs.settings') }} />
    </Tabs>
  );
}
