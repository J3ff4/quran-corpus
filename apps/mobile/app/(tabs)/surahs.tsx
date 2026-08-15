import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { SurahList } from '@/components/SurahList';
import { getSurahList, type SurahListItem } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
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
      // Cleared per run, not just on first mount: this effect reruns when
      // uiLocale changes, and a stale error from an earlier failure would keep
      // the error branch rendering over the list this run just loaded.
      setError(null);
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const list = await getSurahList(client);
        if (!cancelled) setSurahs(list);
      } catch {
        // Localized, never the driver's message: an expo-sqlite failure reads
        // in untranslated English and can name a path on the device.
        if (!cancelled) setError(t(uiLocale, 'surahList.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSurahs();
    return () => {
      cancelled = true;
    };
  }, [uiLocale]);

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
        {/* Live region: the list never gets focus, so without this TalkBack
            announces nothing when the load fails. */}
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SurahList surahs={surahs} uiLocale={uiLocale} onOpenSurah={openSurah} />
    </View>
  );
}
