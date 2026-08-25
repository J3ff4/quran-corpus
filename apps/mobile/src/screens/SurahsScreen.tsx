import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';

import { BrowseList, type BrowseItem, type BrowseSection } from '@/components/BrowseList';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SurahList } from '@/components/SurahList';
import {
  getJuzIndex,
  getPageIndex,
  getRevealedIndex,
  getSurahList,
  type JuzEntry,
  type PageEntry,
  type RevealedEntry,
  type SurahListItem,
} from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { useThemeColors } from '@/theme/themeContext';

type BrowseMode = 'surah' | 'juz' | 'page' | 'revealed';

interface BrowseData {
  surah: SurahListItem[];
  juz: JuzEntry[];
  page: PageEntry[];
  revealed: RevealedEntry[];
}

const LOADERS = {
  surah: getSurahList,
  juz: getJuzIndex,
  page: getPageIndex,
  revealed: getRevealedIndex,
} as const;

/** Opens the reader at a real ayah, in every mode (decisions 18 and 20).
 *
 *  Page browse scrolls to the page's first ayah; a true paged mushaf -- fixed
 *  15-line pages, justified Uthmani, no scroll -- is deferred, not started. */
function openAyah(surahId: number, ayahNumber: number) {
  router.push({
    pathname: '/surah/[surahId]',
    params: { surahId: String(surahId), ayah: String(ayahNumber) },
  });
}

/**
 * The surah index and its three alternative orderings.
 *
 * The mode lives in local state, not in settings: decision 26 makes the
 * word-by-word density global and says nothing about this one, and a reader
 * who looked something up by page yesterday still expects the surah list today.
 *
 * Each mode loads once per mount and is then kept -- 604 page rows is not a
 * query to re-run on every switch, and the switch has to feel instant
 * (check 61).
 */
export function SurahsScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const [mode, setMode] = useState<BrowseMode>('surah');
  const [data, setData] = useState<Partial<BrowseData>>({});
  const [error, setError] = useState<string | null>(null);

  const loaded = data[mode] !== undefined;

  useEffect(() => {
    // Cleared before the bail, not inside load(): the effect returns early for
    // an already-cached mode, so an error left standing from a *different*
    // mode's failed load would render over every other list -- permanently,
    // since switching back never re-runs a load that could clear it.
    setError(null);
    if (loaded) return;
    let cancelled = false;

    async function load() {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const rows = await LOADERS[mode](client);
        if (!cancelled) setData((current) => ({ ...current, [mode]: rows }));
      } catch (cause) {
        // Logged, not shown: the driver's message is the only thing that says
        // *why* a load failed, and it reads in untranslated English and can
        // name a path on the device.
        console.error(`[browse] ${mode} load failed`, cause);
        if (!cancelled) setError(t(uiLocale, 'surahList.loadFailed'));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [mode, loaded, uiLocale]);

  // Language change invalidates every cached mode: the subtitles are
  // localized, and keeping them would leave three of the four lists in the
  // previous language until the tab is remounted.
  useEffect(() => {
    setData({});
  }, [uiLocale]);

  const openSurah = useCallback((surah: SurahListItem) => {
    router.push({ pathname: '/surah/[surahId]', params: { surahId: String(surah.id) } });
  }, []);

  const juzItems = useMemo<BrowseItem[]>(
    () =>
      (data.juz ?? []).map((entry) => ({
        key: `juz-${entry.juz}`,
        testID: `browse-juz-${entry.juz}`,
        leading: String(entry.juz),
        title: `${t(uiLocale, 'browse.juzLabel')} ${entry.juz}`,
        subtitle: `${entry.surahName} ${entry.startAyahNumber} · ${entry.ayahCount} ${t(uiLocale, 'surahList.ayahsSuffix')}`,
        accessibilityLabel: `${t(uiLocale, 'browse.juzLabel')} ${entry.juz}, ${t(uiLocale, 'browse.opensAt')} ${entry.surahName} ${entry.startAyahNumber}`,
        onPress: () => openAyah(entry.startSurahId, entry.startAyahNumber),
      })),
    [data.juz, uiLocale],
  );

  const pageItems = useMemo<BrowseItem[]>(
    () =>
      (data.page ?? []).map((entry) => ({
        key: `page-${entry.page}`,
        testID: `browse-page-${entry.page}`,
        leading: String(entry.page),
        title: `${t(uiLocale, 'browse.pageLabel')} ${entry.page}`,
        subtitle: `${entry.surahName} ${entry.startAyahNumber}`,
        accessibilityLabel: `${t(uiLocale, 'browse.pageLabel')} ${entry.page}, ${t(uiLocale, 'browse.opensAt')} ${entry.surahName} ${entry.startAyahNumber}`,
        onPress: () => openAyah(entry.startSurahId, entry.startAyahNumber),
      })),
    [data.page, uiLocale],
  );

  const revealedSections = useMemo<BrowseSection[]>(() => {
    const rows = data.revealed ?? [];
    if (rows.length === 0) return [];
    // Two sections, cut where the type changes rather than at a hardcoded 86:
    // the hijra splits the ranks cleanly, and a literal index would silently
    // mis-cut if the chronology were ever replaced.
    const sections: BrowseSection[] = [];
    for (const entry of rows) {
      const title = t(uiLocale, entry.revelationType === 'meccan' ? 'browse.meccan' : 'browse.medinan');
      const current = sections.at(-1);
      const item: BrowseItem = {
        key: `revealed-${entry.surahId}`,
        testID: `browse-revealed-${entry.surahId}`,
        leading: String(entry.orderNumber),
        title: entry.nameTranslit,
        arabic: entry.nameArabic,
        accessibilityLabel: `${entry.orderNumber}, ${entry.nameTranslit}, ${title}`,
        onPress: () => openAyah(entry.surahId, 1),
      };
      if (current?.title === title) current.data.push(item);
      else sections.push({ title, data: [item] });
    }
    return sections;
  }, [data.revealed, uiLocale]);

  const options = useMemo(
    () =>
      [
        { value: 'surah', label: t(uiLocale, 'browse.surah') },
        { value: 'juz', label: t(uiLocale, 'browse.juz') },
        { value: 'page', label: t(uiLocale, 'browse.page') },
        { value: 'revealed', label: t(uiLocale, 'browse.revealed') },
      ] as const,
    [uiLocale],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <SegmentedControl
          options={options}
          value={mode}
          onChange={setMode}
          accessibilityLabel={t(uiLocale, 'browse.mode')}
        />
      </View>
      {error ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          {/* Live region: the list never gets focus, so without this TalkBack
              announces nothing when the load fails. */}
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
            {error}
          </Text>
        </View>
      ) : !loaded ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : mode === 'surah' ? (
        <SurahList surahs={data.surah ?? []} uiLocale={uiLocale} onOpenSurah={openSurah} />
      ) : mode === 'revealed' ? (
        <BrowseList sections={revealedSections} />
      ) : (
        <BrowseList items={mode === 'juz' ? juzItems : pageItems} />
      )}
    </View>
  );
}
