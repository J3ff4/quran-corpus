import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';
import type { Word } from '@quran-corpus/data/mobile';
import { VersePicker } from '@/components/VersePicker';
import { WbwGrid } from '@/components/WbwGrid';
import { WordSheet } from '@/components/WordSheet';
import { getWbwScreen, type WbwScreenData, type WordSummary } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { useWordSummaryLoader } from '@/data/useWordSummaryLoader';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

interface OpenWord {
  summary: WordSummary;
  /** Carried from the page the cell belongs to: `Word` holds ayah_id, not the
   *  ayah number the word-detail route is addressed by. */
  ayahNumber: number;
}

export interface WbwScreenProps {
  /** null renders the invalid-surah alert; the caller validates. */
  surahId: number | null;
  from: number;
}

export function WbwScreen({ surahId, from: initialFrom }: WbwScreenProps) {
  const { contentLanguage, uiLocale } = useAppSettings();
  const theme = useThemeColors();

  // Keyed on the raw params, and reset during render when they change.
  // expo-router reuses this component across in-app navigations to the same
  // route, so a plain `useState(initialFrom)` keeps whatever page the reader
  // last paged to: opening surah 3's word-by-word after paging surah 2 to ayah
  // 21 lands on 3:21. The same staleness bit /dictionary/[root] on web.
  const paramKey = `${surahId}:${initialFrom}`;
  const [page, setPage] = useState({ key: paramKey, from: initialFrom });
  if (page.key !== paramKey) setPage({ key: paramKey, from: initialFrom });
  const from = page.from;
  const setFrom = (next: number) => setPage({ key: paramKey, from: next });

  const [wbw, setWbw] = useState<WbwScreenData | null>(null);
  const [corpusClient, setCorpusClient] = useState<MobileDataClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenWord | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!surahId) {
        setError(t(uiLocale, 'reader.invalidSurah'));
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const corpusDb = await openCorpusDb();
        const client = createExpoSqliteClient(corpusDb as ExpoSqliteLike);
        const data = await getWbwScreen(client, surahId, from);
        if (!cancelled) {
          setCorpusClient(client);
          setWbw(data);
        }
      } catch (cause) {
        // See the note in app/(tabs)/surahs.tsx: logged for logcat, never shown.
        console.error('[wbw] load failed', { surahId, from, cause });
        if (!cancelled) setError(t(uiLocale, 'reader.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [from, surahId, uiLocale]);

  const loadWordSummary = useWordSummaryLoader(corpusClient, surahId, contentLanguage);

  // Taps are cheap and the grid puts ~150 of them on screen at once, so two can
  // easily be in flight together. Without the sequence check the sheet shows
  // whichever query finished last, which is not necessarily the word tapped
  // last -- and nothing on screen says the word and its grammar disagree.
  const requestRef = useRef(0);
  function onWordPress(ayahNumber: number, word: Word) {
    const request = (requestRef.current += 1);
    loadWordSummary(word)
      .then((summary) => {
        if (requestRef.current === request) setOpen({ summary, ayahNumber });
      })
      .catch((cause: unknown) => {
        // Nothing opens. A sheet with the morphology missing would look like
        // the word has none, which is never true.
        console.error('[wbw] word summary failed', { wordId: word.id, cause });
      });
  }

  function closeSheet() {
    // Bump the sequence so an in-flight tap cannot re-open the sheet the user
    // has just dismissed.
    requestRef.current += 1;
    setOpen(null);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !wbw) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: theme.background }}>
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
          {error ?? t(uiLocale, 'reader.loadFailed')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* One wrapper around everything the sheet covers, not just the list.
          accessibilityViewIsModal is iOS-only, so on Android this is what stops
          TalkBack swiping into the pager and the title behind the sheet
          (CLAUDE.md §8, WCAG AA). */}
      <View style={{ flex: 1 }} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}>
        <View style={{ paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8, gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: typography.title, fontWeight: '700' }}>
            {wbw.surah.name_translit}
          </Text>
          <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'wbw.title')}</Text>
        </View>
        <VersePicker
          from={wbw.from}
          to={wbw.to}
          ayahCount={wbw.surah.ayah_count}
          uiLocale={uiLocale}
          onRange={(nextFrom) => setFrom(nextFrom)}
        />
        <FlatList
          data={wbw.pages}
          keyExtractor={(page) => String(page.ayahNumber)}
          renderItem={({ item }) => (
            <WbwGrid
              page={item}
              uiLocale={uiLocale}
              onWordPress={(word) => onWordPress(item.ayahNumber, word)}
            />
          )}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
      <WordSheet
        summary={open?.summary ?? null}
        uiLocale={uiLocale}
        onClose={closeSheet}
        onOpenDetail={(word) => {
          if (!open) return;
          const ayahNumber = open.ayahNumber;
          closeSheet();
          router.push(`/word/${wbw.surah.id}/${ayahNumber}/${word.position}`);
        }}
        onOpenRoot={(rootBuckwalter) => {
          closeSheet();
          // Buckwalter carries `$`, `<` and `'`, none of which survive a raw
          // path segment.
          router.push(`/root/${encodeURIComponent(rootBuckwalter)}`);
        }}
      />
    </View>
  );
}
