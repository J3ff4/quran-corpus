import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';
import type { Word } from '@quran-corpus/data/mobile';
import { AdjacentNavButton } from '@/components/AdjacentNav';
import { Icon } from '@/components/icons/Icon';
import { HeaderCard } from '@/components/HeaderCard';
import { LanguageSheet } from '@/components/LanguageSheet';
import { SearchHeaderButton } from '@/components/SearchHeaderButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SurahJumpSheet } from '@/components/SurahJumpSheet';
import { SurahPicker } from '@/components/SurahPicker';
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
import { useSurahIndex } from '@/data/useSurahIndex';
import { useWordSummaryLoader } from '@/data/useWordSummaryLoader';
import { t } from '@/i18n/uiStrings';
import { useEntryPager, useHeldEntry } from '@/motion/entryPager';
import { useAppSettings, type WbwDensity } from '@/settings/settingsStore';
import { touchTargets } from '@/theme/tokens';
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
  const {
    queryLanguage,
    nameLanguage,
    uiLocale,
    wbwDensity,
    setWbwDensity,
    contentLanguage,
    setContentLanguage,
  } = useAppSettings();
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

  // One state, not two booleans: two would let the jump sheet and the picker
  // be open at once, which is the whole failure mode of a sheet that opens
  // another sheet.
  const [jumpView, setJumpView] = useState<'jump' | 'picker' | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const { surahs, ayahCountOf } = useSurahIndex(nameLanguage);

  // A jump can land in this surah or in another one, and the two are different
  // moves: within the surah it is a range change, across it is a page turn the
  // pager has to animate in the direction travelled.
  const jumpTo = (targetSurah: number, ayahNumber: number) => {
    setJumpView(null);
    if (currentSurahId !== null && targetSurah !== currentSurahId) {
      pager.goTo(String(targetSurah), targetSurah > currentSurahId ? 'next' : 'prev');
      // Not setSurah(): that one opens a surah at its beginning, and this one
      // was asked for an ayah.
      setPage({ key: `${targetSurah}:${initialFrom}`, from: ayahNumber });
      // What setFrom does on the in-surah arm, and the reason D46 gives for it:
      // the ayah carries between renderings. Without it, jumping from 2:5 to
      // 3:12 here and going back to the reader opened surah 3 at its top.
      setReaderPosition(targetSurah, ayahNumber);
      return;
    }
    setFrom(ayahNumber);
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
        const data = await getWbwScreen(client, currentSurahId, from, nameLanguage);
        // Sequential: the gloss query is per surah and only worth issuing once
        // the range query has proved the surah exists.
        const surahGlosses = await getSurahGlosses(client, currentSurahId, queryLanguage);
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
  }, [queryLanguage, nameLanguage, currentSurahId, from, uiLocale]);

  const loadWordSummary = useWordSummaryLoader(corpusClient, displayedSurahId, queryLanguage);

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

  // Every sheet that covers the screen, not just the word one: on Android
  // `accessibilityViewIsModal` does nothing, so a sheet left out of this is a
  // sheet TalkBack can swipe straight behind.
  const sheetsOpen = Boolean(open) || languageOpen || jumpView !== null;

  // Both branches below carry the chrome, and they have to: the route runs
  // `headerShown: false` (app/_layout.tsx), so the only back button on this
  // screen is HeaderCard's. Rendered without it, a failed load -- a bad deep
  // link like /surah/999/words, or any DB error -- left the reader with no way
  // out but the OS gesture, and its text drawn under the status bar.
  const chrome = (
    <HeaderCard
      title={view?.surah.name_translit ?? t(uiLocale, 'wbw.title')}
      onBack={() => router.back()}
      uiLocale={uiLocale}
      testIDPrefix="wbw"
    />
  );

  // Only with nothing to hold -- the screen's first load. A page turn keeps
  // the outgoing surah up, which is the half that slides out.
  if (loading && !view) {
    return (
      <View style={{ flex: 1 }}>
        {chrome}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  if (error || !view) {
    return (
      <View style={{ flex: 1 }}>
        {chrome}
        <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
            {error ?? t(uiLocale, 'reader.loadFailed')}
          </Text>
        </View>
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
        importantForAccessibility={sheetsOpen ? 'no-hide-descendants' : 'auto'}
      >
        {/* The reader's own chrome, not a second styling of it (owner,
            2026-09-22). HeaderCard carries the glass, the centred display-face
            name and the kebab curtain -- every ruling behind those was made
            for the reader's header and is documented there. What this screen
            supplies is the row it pages with.

            Drawn in the screen, not pushed to the navigator with setOptions:
            morphology was a tab until M7d and tabs run headerShown: false, so
            on that entry point the surah name and the pager were both silently
            absent and there was no way to change the range at all (issue #25,
            M6e device run). The route hides the navigator's own header instead,
            so this card's back button is the only one. */}
        <HeaderCard
          title={view.surah.name_translit}
          // The name IS the jump control (ruling S3), and here it never fades:
          // there is no list heading below it to hand the name to.
          onTitlePress={() => setJumpView('jump')}
          titleAccessibilityLabel={`${view.surah.name_translit}, ${t(uiLocale, 'jump.surahTitle')}`}
          onBack={() => router.back()}
          uiLocale={uiLocale}
          testIDPrefix="wbw"
          middleRow={
            /* The ayah pager, flanked by the surah chevrons (R4): the two
               orders of movement -- within a surah and between surahs -- sit
               on one line, bounded rather than nested (D49). This is the row
               the reader spends on its mode pill. */
            <View
              testID="wbw-pager-row"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}
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
              <View style={{ flex: 1 }}>
                <VersePicker
                  from={view.from}
                  to={view.to}
                  ayahCount={view.surah.ayah_count}
                  uiLocale={uiLocale}
                  onRange={(nextFrom) => setFrom(nextFrom)}
                />
              </View>
              <AdjacentNavButton
                side="next"
                target={
                  currentSurahId !== null && currentSurahId < 114
                    ? String(currentSurahId + 1)
                    : null
                }
                onNavigate={(target, side) => setSurah(Number(target), side)}
                uiLocale={uiLocale}
                testIDPrefix="surah"
              />
            </View>
          }
          actions={
            /* Search, gloss language, density (R5). No translation toggle --
               this screen has nothing to toggle -- and no Uzbek script switch:
               that is a global setting and a screen-scoped copy of it would
               read as a screen-scoped setting. */
            <View style={{ gap: 10, paddingTop: 4 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 24,
                }}
              >
                {/* Global search, the same push the reader's magnifier makes
                    (R6). A morphology-scoped search would be a second search
                    with a smaller corpus and no way to say so. */}
                <SearchHeaderButton uiLocale={uiLocale} onPress={() => router.push('/search')} />
                <Pressable
                  testID="open-language"
                  accessibilityRole="button"
                  accessibilityLabel={t(uiLocale, 'reader.chooseLanguage')}
                  onPress={() => setLanguageOpen(true)}
                  style={{
                    minHeight: touchTargets.minimum,
                    minWidth: touchTargets.minimum,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="globe" color={theme.accent} />
                </Pressable>
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
          }
        />
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
      {languageOpen ? (
        <LanguageSheet
          value={contentLanguage}
          uiLocale={uiLocale}
          onChange={setContentLanguage}
          onClose={() => setLanguageOpen(false)}
        />
      ) : null}
      {jumpView === 'jump' && currentSurahId !== null ? (
        <SurahJumpSheet
          uiLocale={uiLocale}
          surahId={currentSurahId}
          ayahCountOf={ayahCountOf}
          onClose={() => setJumpView(null)}
          onJump={jumpTo}
          // No rows, no row: the picker has nothing to show until the index
          // read lands.
          onBrowse={surahs === null ? undefined : () => setJumpView('picker')}
        />
      ) : null}
      {/* The same `currentSurahId` guard the sheet above carries, and for the
          same reason: `jumpTo` only navigates on its cross-surah arm, so with
          no surah to compare against a pick would quietly become a range
          change instead of opening anything.

          Unreachable today -- a null id sets `reader.invalidSurah` and the
          error branch above returns before this tree renders at all -- so no
          test asserts it; one would pass with the condition deleted. It is
          here so the picker and the sheet state the same precondition, not as
          a defence that has ever fired. */}
      {jumpView === 'picker' && surahs !== null && currentSurahId !== null ? (
        <SurahPicker
          surahs={surahs}
          uiLocale={uiLocale}
          // Ruling R3: the name goes to the head of the surah. jumpTo closes
          // both -- it is the same move the sheet's Go makes.
          onPick={(surahId) => jumpTo(surahId, 1)}
          onClose={() => setJumpView(null)}
        />
      ) : null}
    </View>
  );
}
