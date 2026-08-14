import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { contentLanguages, uiLocales } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { useThemeColors } from '@/theme/themeContext';

const themeLabelKeys = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
} as const;

export default function SettingsTab() {
  const settings = useAppSettings();
  const { uiLocale } = settings;
  const theme = useThemeColors();

  return (
    <View style={{ flex: 1, padding: 20, gap: 16, backgroundColor: theme.background }}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{t(uiLocale, 'tabs.settings')}</Text>
      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>{t(uiLocale, 'settings.language')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {uiLocales.map((locale) => (
            <Pressable
              key={locale.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: locale.code === settings.uiLocale }}
              onPress={() => settings.setUiLocale(locale.code)}
            >
              <Text style={{ color: locale.code === settings.uiLocale ? theme.accent : theme.mutedText }}>
                {locale.nativeLabel}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>{t(uiLocale, 'reader.translation')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {contentLanguages.map((language) => (
            <Pressable
              key={language.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: language.code === settings.contentLanguage }}
              onPress={() => settings.setContentLanguage(language.code)}
            >
              <Text style={{ color: language.code === settings.contentLanguage ? theme.accent : theme.mutedText }}>
                {language.nativeLabel}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>{t(uiLocale, 'settings.theme')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['system', 'light', 'dark'] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: option === settings.theme }}
              onPress={() => settings.setTheme(option)}
            >
              <Text style={{ color: option === settings.theme ? theme.accent : theme.mutedText }}>
                {t(uiLocale, themeLabelKeys[option])}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: settings.analyticsEnabled }}
        onPress={() => settings.setAnalyticsEnabled(!settings.analyticsEnabled)}
      >
        <Text style={{ color: settings.analyticsEnabled ? theme.accent : theme.mutedText }}>
          {t(uiLocale, settings.analyticsEnabled ? 'settings.analyticsOn' : 'settings.analyticsOff')}
        </Text>
      </Pressable>
      <Link href="/about" style={{ color: theme.accent }}>
        {t(uiLocale, 'settings.about')}
      </Link>
    </View>
  );
}
