import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { openUserDb } from '@/data/userDb';
import { getLastReadingPosition, type ReadingPosition } from '@/data/userRepository';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { colors } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export default function HomeTab() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const [position, setPosition] = useState<ReadingPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On focus, not on mount: the reader writes the position as you scroll, so
  // returning to this tab has to re-read it or the card keeps showing wherever
  // you were the last time the tab mounted. Same pattern as the bookmarks tab.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadPosition() {
        setError(null);
        setLoading(true);
        try {
          const userDb = await openUserDb();
          const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
          const lastPosition = await getLastReadingPosition(userClient);
          if (!cancelled) setPosition(lastPosition);
        } catch (cause) {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : 'Unable to load reading history');
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      loadPosition();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 20, gap: 12 }}>
      <Text style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}>{t(uiLocale, 'home.continue')}</Text>
      {loading ? <ActivityIndicator /> : null}
      {!loading && error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {!loading && !error && !position ? (
        <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'home.noHistory')}</Text>
      ) : null}
      {!loading && !error && position ? (
        <Link
          href={{ pathname: '/surah/[surahId]', params: { surahId: String(position.surahId) } }}
          style={{ color: theme.accent, fontSize: 17 }}
        >
          {position.surahId}:{position.ayahNumber}
        </Link>
      ) : null}
    </View>
  );
}
