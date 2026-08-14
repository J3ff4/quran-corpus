import { Link } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { getLastReadingPosition } from '@/data/userRepository';
import { useUserDbOnFocus } from '@/data/useUserDbOnFocus';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { useThemeColors } from '@/theme/themeContext';

export default function HomeTab() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const { data: position, loading, error } = useUserDbOnFocus(
    getLastReadingPosition,
    t(uiLocale, 'home.loadFailed'),
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 20, gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}>
        {t(uiLocale, 'home.continue')}
      </Text>
      {loading ? <ActivityIndicator /> : null}
      {!loading && error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
          {error}
        </Text>
      ) : null}
      {!loading && !error && !position ? (
        <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'home.noHistory')}</Text>
      ) : null}
      {!loading && !error && position ? (
        <Link
          href={{
            pathname: '/surah/[surahId]',
            // Without the ayah the link opened the surah at ayah 1, which for
            // al-Baqarah means the saved position was 254 rows away.
            params: { surahId: String(position.surahId), ayah: String(position.ayahNumber) },
          }}
          // The visible label is bare coordinates ("2:255"); on its own a screen
          // reader announces two numbers with no indication of what tapping does.
          accessibilityLabel={`${t(uiLocale, 'home.continue')} ${position.surahId}:${position.ayahNumber}`}
          accessibilityRole="link"
          style={{ color: theme.accent, fontSize: 17 }}
        >
          {position.surahId}:{position.ayahNumber}
        </Link>
      ) : null}
    </View>
  );
}
