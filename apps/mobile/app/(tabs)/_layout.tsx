import { Tabs } from 'expo-router';
import { Icon } from '@/components/icons/Icon';
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
      <Tabs.Screen
        name="index"
        options={{
          title: t(uiLocale, 'tabs.home'),
          tabBarIcon: ({ color, size }) => <Icon name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="surahs"
        options={{
          title: t(uiLocale, 'tabs.surahs'),
          tabBarIcon: ({ color, size }) => <Icon name="book" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          title: t(uiLocale, 'tabs.bookmarks'),
          tabBarIcon: ({ color, size }) => <Icon name="bookmark" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t(uiLocale, 'tabs.settings'),
          tabBarIcon: ({ color, size }) => <Icon name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
