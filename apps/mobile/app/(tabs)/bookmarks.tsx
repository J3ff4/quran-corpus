import { Link } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { getBookmarks } from '@/data/userRepository';
import { useUserDbOnFocus } from '@/data/useUserDbOnFocus';
import { useAppSettings } from '@/settings/settingsStore';
import { t } from '@/i18n/uiStrings';
import { useThemeColors } from '@/theme/themeContext';

export default function BookmarksTab() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const { data, loading, error } = useUserDbOnFocus(getBookmarks, t(uiLocale, 'bookmarks.loadFailed'));
  const bookmarks = data ?? [];

  return (
    <View style={{ flex: 1, padding: 20, gap: 12, backgroundColor: theme.background }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>
        {t(uiLocale, 'tabs.bookmarks')}
      </Text>
      {/* Inline, not a full-screen spinner: this reloads on every focus, and a
          blocking spinner tore down the heading and the list the user was
          already looking at, then put them back. */}
      {loading ? <ActivityIndicator /> : null}
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
          {error}
        </Text>
      ) : null}
      {!loading && !error && bookmarks.length === 0 ? (
        <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'bookmarks.empty')}</Text>
      ) : null}
      {bookmarks.map((bookmark) => (
        <Link
          key={`${bookmark.surahId}:${bookmark.ayahNumber}`}
          href={{
            pathname: '/surah/[surahId]',
            params: { surahId: String(bookmark.surahId), ayah: String(bookmark.ayahNumber) },
          }}
          accessibilityRole="link"
          style={{ color: theme.accent }}
        >
          {t(uiLocale, 'bookmarks.entryPrefix')} {bookmark.surahId}:{bookmark.ayahNumber}
        </Link>
      ))}
    </View>
  );
}
