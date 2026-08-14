import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { openUserDb } from '@/data/userDb';
import { getBookmarks, type Bookmark } from '@/data/userRepository';
import { useAppSettings } from '@/settings/settingsStore';
import { t } from '@/i18n/uiStrings';
import { colors } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export default function BookmarksTab() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;

    async function loadBookmarks() {
      setError(null);
      setLoading(true);
      try {
        const userDb = await openUserDb();
        const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
        const savedBookmarks = await getBookmarks(userClient);
        if (!cancelled) setBookmarks(savedBookmarks);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load bookmarks');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBookmarks();
    return () => {
      cancelled = true;
    };
  }, []));

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 12, backgroundColor: theme.background }}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{t(uiLocale, 'tabs.bookmarks')}</Text>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {!error && bookmarks.length === 0 ? <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'bookmarks.empty')}</Text> : null}
      {bookmarks.map((bookmark) => (
        <Link
          key={`${bookmark.surahId}:${bookmark.ayahNumber}`}
          href={{ pathname: '/surah/[surahId]', params: { surahId: String(bookmark.surahId) } }}
          style={{ color: theme.accent }}
        >
          {t(uiLocale, 'bookmarks.entryPrefix')} {bookmark.surahId}:{bookmark.ayahNumber}
        </Link>
      ))}
    </View>
  );
}
