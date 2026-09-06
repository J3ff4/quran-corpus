import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';
import type { Word } from '@quran-corpus/data/mobile';
import { AdjacentNavButton } from '@/components/AdjacentNav';
import { SegmentedControl } from '@/components/SegmentedControl';
import { VersePicker } from '@/components/VersePicker';
import { WbwDense } from '@/components/WbwDense';
import { WbwHybrid } from '@/components/WbwHybrid';
import { WordSheet } from '@/components/WordSheet';
import {
  getSurahGlosses,
  getWbwScreen,
  type WbwScreenData,
  type Gloss,
  type WordSummary,
} from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { setReaderPosition } from '@/data/readerPosition';
import { useWordSummaryLoader } from '@/data/useWordSummaryLoader';
import { t } from '@/i18n/uiStrings';
import { useEntryPager, useHeldEntry } from '@/motion/entryPager';
import { useAppSettings, type WbwDensity } from '@/settings/settingsStore';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

// Dense first, and it is the default (owner ruling 2026-09-01). The order is
// the same here and in Settings: two controls for one setting that disagree on
// which segment sits left read as two different settings.
const DENSITY_OPTIONS: readonly { value: WbwDensity; labelKey: 'wbw.densityHybrid' | 'wbw.densityDense' }[] = [
  { value: 'dense', labelKey: 'wbw.densityDense' },
  { value: 'hybrid', labelKey: 'wbw.densityHybrid' },
];

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
  const { contentLanguage, uiLocale, wbwDensity, setWbwDensity } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();

  // Keyed on the raw params, and reset during render when they change.
  // expo-router reuses this component across in-app navigations to the same
  // route, so a plain `useState(initialFrom)` keeps whatever page the reader
  // last paged to: opening surah 3's word-by-word after paging surah 2 to ayah
  // 21 lands on 3:21. The same staleness bit /dictionary/[root] on web.
  // The same pager the reader and the dictionary entries use: paging is state,
  // not navigation (D48), so the prop stays on the surah this screen was
  // *opened* with and this is the surah it is actually showing.
  const pager = useEntryPager(surahId === null ? null : String(surahId));
  const currentSurahId = pager.current === null ? null : Number(pager.current);

  const paramKey = `${currentSurahId}:${initialFrom}`;
  const [page, setPage] = useState({ key: paramKey, from: initialFrom });
  if (page.key !== paramKey) setPage({ key: paramKey, from: initialFrom });
  const from = page.from;
  const setFrom = (next: number) => {
    setPage({ key: paramKey, from: next });
    // D46: the reader re-lands here when this screen is popped. Guarded on the
    // surah because the store is scoped by it, and a null id has no position
    // to publish.
    if (displayedSurahId !== null) setReaderPosition(displayedSurahId, next);
  };

  const setSurah = (target: number, side: 'prev' | 'next') => {
    pager.goTo(String(target), side);
    // A new surah starts at its beginning: the range belongs to the surah it
    // was read in, and Aal-Imran has no ayah 250. Written straight to the page
    // rather than left to the key above, which only resets on a *param*
    // change and this is not one.
    setPage({ key: `${target}:${initialFrom}`, from: 1 });
  };

  // Carries the surah it was loaded FOR: see the note on the reader route. The
  // held copy is only safe while it answers the request the pager is on, and
  // the payload is not what says which request that was.
  const [wbw, setWbw] = useState<{ surahId: number; data: WbwScreenData } | null>(null);
  // Fetched here rather than left to the sheet's loader: every layout now
  // prints a gloss under every word, so the map is needed to RENDER the
  // screen, not just to answer a tap. useWordSummaryLoader keeps its own copy
  // because the reader shares it -- one duplicate query per surah, off the
  // first-paint path, in exchange for not threading a cache through two
  // screens.
  const [glosses, setGlosses] = useState<Map<number, Gloss>>(new Map());
  const [corpusClient, setCorpusClient] = useState<MobileDataClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenWord | null>(null);
  // The surah kept on screen while the next one loads, the same as the reader
  // and the dictionary entries. Without it a page turn blanked to a spinner,
  // so there was never an outgoing screen for reanimated to slide out and the
  // pager the comment above claims was silently a plain jump.
  const heldWbw = useHeldEntry(wbw && wbw.surahId === currentSurahId ? wbw : null);
  const view = heldWbw?.data ?? null;
  const displayedSurahId = heldWbw?.surahId ?? null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!currentSurahId) {
        setError(t(uiLocale, 'reader.invalidSurah'));
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const corpusDb = await openCorpusDb();
        const client = createExpoSqliteClient(corpusDb as ExpoSqliteLike);
        const data = await getWbwScreen(client, currentSurahId, from);
        // Sequential: the gloss query is per surah and only worth issuing once
        // the range query has proved the surah exists.
        const surahGlosses = await getSurahGlosses(client, currentSurahId, contentLanguage);
        if (!cancelled) {
          setCorpusClient(client);
          setWbw({ surahId: currentSurahId, data });
          setGlosses(surahGlosses);
        }
      } catch (cause) {
        // See the note in app/(tabs)/surahs.tsx: logged for logcat, never shown.
        console.error('[wbw] load failed', { surahId: currentSurahId, from, cause });
        if (!cancelled) setError(t(uiLocale, 'reader.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [contentLanguage, currentSurahId, from, uiLocale]);

  const loadWordSummary = useWordSummaryLoader(corpusClient, displayedSurahId, contentLanguage);

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

  // Only with nothing to hold -- the screen's first load. A page turn keeps
  // the outgoing surah up, which is the half that slides out.
  if (loading && !view) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !view) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
          {error ?? t(uiLocale, 'reader.loadFailed')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* accessibilityViewIsModal is iOS-only, so on Android this is what stops
          TalkBack swiping into the grid behind the sheet (CLAUDE.md §8, WCAG
          AA). The pager is inside it now that it renders in the screen, so it
          is hidden along with everything else rather than unmounted. */}
      <Animated.View
        testID="wbw-screen"
        // Keyed by surah so reanimated sees one leave as the other arrives;
        // reconciled into a single view there would be nothing to animate.
        key={displayedSurahId}
        entering={pager.animation.entering}
        exiting={pager.animation.exiting}
        style={{ flex: 1 }}
        importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
      >
        {/* Drawn in the screen rather than pushed to the nav header with
            setOptions. The morphology tab has no header to push to -- tabs run
            headerShown: false since M6a, because a native header strip cuts
            across the bloom -- so on that entry point the surah name and the
            pager were both silently absent, leaving no way to change the ayah
            range at all (issue #25, found on the M6e device run). Here they
            reach both entry points, and it is what every other screen already
            does: app/_layout.tsx sets `title: ''` on the Stack so the nav
            header carries the back affordance and nothing else.

            Name and pager share one row on purpose. Stacked as separate rows
            under a header they ate roughly a third of the screen before the
            first word (owner screenshot, 2026-08-17). */}
        <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 10 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <AdjacentNavButton
              side="prev"
              target={
                currentSurahId !== null && currentSurahId > 1 ? String(currentSurahId - 1) : null
              }
              onNavigate={(target, side) => setSurah(Number(target), side)}
              uiLocale={uiLocale}
              testIDPrefix="surah"
            />
            <Text
              accessibilityRole="header"
              // Clamped and shrinkable: 'Al-Munafiqoon' beside the pager
              // overflows a 390pt frame, and an unclamped name would push the
              // pager off the edge instead of truncating itself.
              numberOfLines={1}
              style={{ color: theme.text, fontSize: typography.title, fontWeight: '700', flexShrink: 1 }}
            >
              {view.surah.name_translit}
            </Text>
            <VersePicker
              from={view.from}
              to={view.to}
              ayahCount={view.surah.ayah_count}
              uiLocale={uiLocale}
              onRange={(nextFrom) => setFrom(nextFrom)}
            />
            {/* The row is bounded by surah navigation with the ayah pager
                inside it (D49), so the two orders of movement do not read as
                one control. */}
            <AdjacentNavButton
              side="next"
              target={
                currentSurahId !== null && currentSurahId < 114 ? String(currentSurahId + 1) : null
              }
              onNavigate={(target, side) => setSurah(Number(target), side)}
              uiLocale={uiLocale}
              testIDPrefix="surah"
            />
          </View>
          <SegmentedControl
            options={DENSITY_OPTIONS.map((option) => ({
              value: option.value,
              label: t(uiLocale, option.labelKey),
            }))}
            value={wbwDensity}
            onChange={setWbwDensity}
            accessibilityLabel={t(uiLocale, 'wbw.density')}
          />
        </View>
        <FlatList
          // Held across a range change now that the screen no longer blanks,
          // so without this the new range opens at the old one's scroll offset.
          key={view.from}
          data={view.pages}
          keyExtractor={(page) => String(page.ayahNumber)}
          renderItem={({ item }) => {
            const layoutProps = {
              page: item,
              uiLocale,
              glosses,
              onWordPress: (word: Word) => onWordPress(item.ayahNumber, word),
            };
            return wbwDensity === 'dense' ? (
              <WbwDense {...layoutProps} />
            ) : (
              <WbwHybrid {...layoutProps} />
            );
          }}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom }}
        />
      </Animated.View>
      <WordSheet
        summary={open?.summary ?? null}
        uiLocale={uiLocale}
        onClose={closeSheet}
        onOpenDetail={(word) => {
          if (!open) return;
          const ayahNumber = open.ayahNumber;
          closeSheet();
          router.push(`/word/${displayedSurahId}/${ayahNumber}/${word.position}`);
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
