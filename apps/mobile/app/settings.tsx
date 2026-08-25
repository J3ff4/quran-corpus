import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { contentLanguages, uiLocales } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const themeLabelKeys = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
} as const;

const arabicSizeLabelKeys = {
  small: 'settings.arabicSizeSmall',
  medium: 'settings.arabicSizeMedium',
  large: 'settings.arabicSizeLarge',
  xlarge: 'settings.arabicSizeXlarge',
} as const;

/**
 * One option in a single-choice row.
 *
 * Selection used to be accent-vs-muted text and nothing else, which fails WCAG
 * 1.4.1 (colour as the only carrier of meaning) and left the three groups on
 * this screen unreadable to anyone who cannot separate those two greens. The
 * filled/hollow bullet and the weight change carry the same information without
 * colour. The bullet is decorative, so accessibilityLabel keeps it out of what
 * a screen reader announces -- the radio role already conveys selection there.
 */
function ChoiceOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: touchTargets.minimum, justifyContent: 'center', paddingHorizontal: 4 }}
    >
      <Text style={{ color: selected ? theme.accent : theme.mutedText, fontWeight: selected ? '700' : '400' }}>
        {selected ? '● ' : '○ '}
        {label}
      </Text>
    </Pressable>
  );
}

export default function SettingsRoute() {
  const settings = useAppSettings();
  const { uiLocale } = settings;
  const theme = useThemeColors();

  return (
    <View style={{ flex: 1, padding: 20, gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>
        {t(uiLocale, 'tabs.settings')}
      </Text>
      {/* Without this the screen happily accepts changes it is not persisting. */}
      {settings.storageError ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
          {t(uiLocale, 'settings.storageUnavailable')}
        </Text>
      ) : null}
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>{t(uiLocale, 'settings.language')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {uiLocales.map((locale) => (
            <ChoiceOption
              key={locale.code}
              label={locale.nativeLabel}
              selected={locale.code === settings.uiLocale}
              onPress={() => settings.setUiLocale(locale.code)}
            />
          ))}
        </View>
      </View>
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>{t(uiLocale, 'reader.translation')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {contentLanguages.map((language) => (
            <ChoiceOption
              key={language.code}
              label={language.nativeLabel}
              selected={language.code === settings.contentLanguage}
              onPress={() => settings.setContentLanguage(language.code)}
            />
          ))}
        </View>
      </View>
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>{t(uiLocale, 'settings.theme')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['system', 'light', 'dark'] as const).map((option) => (
            <ChoiceOption
              key={option}
              label={t(uiLocale, themeLabelKeys[option])}
              selected={option === settings.theme}
              onPress={() => settings.setTheme(option)}
            />
          ))}
        </View>
      </View>
      {/* Four discrete steps, not a slider: these are the only values
          useArabicSizes accepts, and a slider would imply a range that does
          not exist. */}
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>{t(uiLocale, 'settings.arabicSize')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['small', 'medium', 'large', 'xlarge'] as const).map((option) => (
            <ChoiceOption
              key={option}
              label={t(uiLocale, arabicSizeLabelKeys[option])}
              selected={option === settings.arabicScale}
              onPress={() => settings.setArabicScale(option)}
            />
          ))}
        </View>
      </View>
      {/* In-app because the OS switch has no single path: Pixel puts it under
          Accessibility, Samsung under Visibility enhancements, and the owner's
          device exposed neither. This one only ever ADDS reduced motion -- see
          useReducedMotion. */}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: settings.reduceMotion }}
        onPress={() => settings.setReduceMotion(!settings.reduceMotion)}
        style={{ minHeight: touchTargets.minimum, justifyContent: 'center' }}
      >
        <Text style={{ color: settings.reduceMotion ? theme.accent : theme.mutedText }}>
          {t(uiLocale, settings.reduceMotion ? 'settings.reduceMotionOn' : 'settings.reduceMotionOff')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: settings.analyticsEnabled }}
        onPress={() => settings.setAnalyticsEnabled(!settings.analyticsEnabled)}
        style={{ minHeight: touchTargets.minimum, justifyContent: 'center' }}
      >
        <Text style={{ color: settings.analyticsEnabled ? theme.accent : theme.mutedText }}>
          {t(uiLocale, settings.analyticsEnabled ? 'settings.analyticsOn' : 'settings.analyticsOff')}
        </Text>
      </Pressable>
      <Link
        href="/about"
        accessibilityRole="link"
        style={{ color: theme.accent, minHeight: touchTargets.minimum, paddingTop: 12 }}
      >
        {t(uiLocale, 'settings.about')}
      </Link>
    </View>
  );
}
