import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { SurahList } from '@/components/SurahList';
import { getSurahList, type SurahListItem } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { useAppSettings } from '@/settings/settingsStore';
import { colors } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export default function SurahsTab() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const [surahs, setSurahs] = useState<SurahListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSurahs() {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const list = await getSurahList(client);
        if (!cancelled) setSurahs(list);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load surahs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSurahs();
    return () => {
      cancelled = true;
    };
  }, []);

  function openSurah(item: SurahListItem) {
    router.push({ pathname: '/surah/[surahId]', params: { surahId: String(item.id) } });
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: theme.background }}>
        <Text style={{ color: colors.danger }}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SurahList surahs={surahs} uiLocale={uiLocale} onOpenSurah={openSurah} />
    </View>
  );
}
