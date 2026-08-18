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
        name="morphology"
        options={{
          title: t(uiLocale, 'tabs.morphology'),
          tabBarIcon: ({ color, size }) => <Icon name="words" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="dictionary"
        options={{
          title: t(uiLocale, 'tabs.dictionary'),
          tabBarIcon: ({ color, size }) => <Icon name="dictionary" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: t(uiLocale, 'tabs.menu'),
          tabBarIcon: ({ color, size }) => <Icon name="menu" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
