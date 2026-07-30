import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { contentLanguages, uiLocales } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { colors } from '@/theme/tokens';

const themeLabelKeys = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
} as const;

export default function SettingsTab() {
  const settings = useAppSettings();
  const { uiLocale } = settings;

  return (
    <View style={{ flex: 1, padding: 20, gap: 16, backgroundColor: colors.paper }}>
      <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700' }}>{t(uiLocale, 'tabs.settings')}</Text>
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{t(uiLocale, 'settings.language')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {uiLocales.map((locale) => (
            <Pressable
              key={locale.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: locale.code === settings.uiLocale }}
              onPress={() => settings.setUiLocale(locale.code)}
            >
              <Text style={{ color: locale.code === settings.uiLocale ? colors.accent : colors.muted }}>
                {locale.nativeLabel}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{t(uiLocale, 'reader.translation')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {contentLanguages.map((language) => (
            <Pressable
              key={language.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: language.code === settings.contentLanguage }}
              onPress={() => settings.setContentLanguage(language.code)}
            >
              <Text style={{ color: language.code === settings.contentLanguage ? colors.accent : colors.muted }}>
                {language.nativeLabel}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{t(uiLocale, 'settings.theme')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['system', 'light', 'dark'] as const).map((theme) => (
            <Pressable
              key={theme}
              accessibilityRole="radio"
              accessibilityState={{ selected: theme === settings.theme }}
              onPress={() => settings.setTheme(theme)}
            >
              <Text style={{ color: theme === settings.theme ? colors.accent : colors.muted }}>
                {t(uiLocale, themeLabelKeys[theme])}
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
        <Text style={{ color: settings.analyticsEnabled ? colors.accent : colors.muted }}>
          {t(uiLocale, settings.analyticsEnabled ? 'settings.analyticsOn' : 'settings.analyticsOff')}
        </Text>
      </Pressable>
      <Link href="/about" style={{ color: colors.accent }}>
        {t(uiLocale, 'settings.about')}
      </Link>
    </View>
  );
}
