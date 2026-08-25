import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { router, useNavigation } from 'expo-router';
import { splitBasmala, type Word } from '@quran-corpus/data/mobile';
import type { ReaderAyah, SurahReaderData, WordSummary } from '@/data/corpusRepository';
import type { ContentLanguageCode, UiLocaleCode } from '@/i18n/languages';
import type { ReaderMode } from '@/settings/settingsStore';

import { AyahCard } from './AyahCard';
import { MushafAyah } from './MushafAyah';
import { ReaderHeader } from './ReaderHeader';
import { Bismillah } from './Bismillah';
import { LanguageSheet } from './LanguageSheet';
import { WordSheet } from './WordSheet';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

interface SurahReaderProps {
  data: SurahReaderData;
  bookmarkedAyahs: Set<number>;
  playingAyah: number | null;
  audioEnabled: boolean;
  uiLocale: UiLocaleCode;
  /** The reader owns no settings state; the screen above it does. Passed down
   *  rather than read from the store so this component stays renderable in a
   *  test without the store's expo-sqlite import. */
  contentLanguage: ContentLanguageCode;
  onChangeContentLanguage: (code: ContentLanguageCode) => void;
  /** Which rendering the ayahs get. Owned by the screen above for the same
   *  reason contentLanguage is: it is a persisted setting, and reading it here
   *  would drag the settings store's expo-sqlite import into every test that
   *  renders a reader. */
  readerMode: ReaderMode;
  onChangeReaderMode: (mode: ReaderMode) => void;
  /** Ayah to open at, from a bookmark or the saved reading position. */
  initialAyahNumber?: number | null;
  /** Omitted leaves the reader as a plain mushaf: every ayah renders its full
   *  Uthmani text, with no tap targets. */
  loadWords?: (ayahId: number) => Promise<Word[]>;
  loadWordSummary?: (word: Word) => Promise<WordSummary>;
  onToggleBookmark: (ayahNumber: number) => void;
  onToggleAudio: (ayahNumber: number) => void;
  onReadingAyah?: (ayahNumber: number) => void;
}

// Ayah cards are variable height (Arabic runs wrap differently per ayah), so
// there is no getItemLayout to give FlatList and scrollToIndex fails for any
// row it has not measured yet. Two halves make a deep-link landing exact
// instead of approximate: initialNumToRender is widened to cover the target,
// so the row is rendered and therefore measurable on the first commit; and the
// list stays hidden until the scroll lands, so no attempt is ever seen as
// motion.
//
// The recovery this replaces jumped to averageItemLength * index -- an average
// taken over the short cards near the top, so it landed short, retried from
// there and kept wherever the fifth try left it. On the owner's device
// (2026-08-23) 16:90 landed on 16:49, and every jump on the way fired
// onViewableItemsChanged, writing an ayah the reader never saw into the saved
// reading position.
//
// "FlatList reported no failure" is not the same as "the row is at the top".
// scrollToIndex computes its offset from the row heights measured so far, so a
// card above the target that has rendered but not finished laying out measures
// short, the jump lands short, and the target slides further down as those
// cards settle. So every attempt re-scrolls, and only a scroll that both missed
// nothing and left the content height unchanged counts as the landing. (Owner
// device, 2026-08-23: 6:87 opened from a concordance row two cards below the
// top, and the same from search and bookmarks.)
const MAX_SCROLL_ATTEMPTS = 25;
const SCROLL_RETRY_DELAY_MS = 100;
// React Native's own default. Restated because the deep-link case overrides it
// and a bare 10 in the JSX reads as a number someone chose.
const DEFAULT_INITIAL_RENDER = 10;

// Ayahs fetched ahead of the one scrolling into view. The whole-surah fetch is
// deliberately not restored -- corpusRepository.ts records why (6,116 word rows
// for al-Baqarah). Per-ayah with a lookahead keeps every query bounded and, on
// a local SQLite file, lands before the ayah reaches the middle of the screen.
const WORD_LOOKAHEAD = 3;

// The nav title's fade, in dp of scroll. It finishes just before the list
// header's last pixel leaves, so the name has arrived by the time the heading
// it replaces is gone rather than starting from nothing at that moment.
const TITLE_FADE_END = 4;
const TITLE_FADE_DISTANCE = 40;
// How far the name rises as it fades. Small enough to read as the same word
// settling into the bar, not as a second element flying in.
const TITLE_RISE = 10;

// Shared instance: a fresh `[]` per render would change AyahText's memo key
// for every not-yet-loaded ayah on every scroll frame.
const EMPTY_WORDS: Word[] = [];

export function SurahReader({
  data,
  bookmarkedAyahs,
  playingAyah,
  audioEnabled,
  uiLocale,
  contentLanguage,
  onChangeContentLanguage,
  readerMode,
  onChangeReaderMode,
  initialAyahNumber,
  loadWords,
  loadWordSummary,
  onToggleBookmark,
  onToggleAudio,
  onReadingAyah,
}: SurahReaderProps) {
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
  const navigation = useNavigation();
  const listRef = useRef<FlatList<SurahReaderData['ayahs'][number]>>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  // Set by onScrollToIndexFailed, read by the attempt loop below. A ref, not
  // state: FlatList reports the failure synchronously during a scroll and a
  // re-render per attempt would remount nothing useful.
  const failedRef = useRef(false);
  // The list's content height, and the height the previous attempt scrolled
  // over. Equal means nothing above the target grew in that window, which is
  // the only evidence available here that the offset the scroll used is the
  // offset the row actually sits at.
  const contentHeightRef = useRef(0);
  const settledHeightRef = useRef(-1);
  // The same value as `positioned` below. onViewableItemsChanged is called by
  // FlatList from outside the React tree off a ref that never re-reads props,
  // so it cannot see the state.
  const positionedRef = useRef(false);
  const [positioned, setPositioned] = useState(false);

  const [languageOpen, setLanguageOpen] = useState(false);

  // The nav header carries the surah name once the list header's 24pt heading
  // has scrolled off -- Android's own app-bar behaviour, and it keeps the name
  // on screen at ayah 150 where the list header is long gone.
  //
  // Scroll-linked rather than switched at a threshold: as a boolean the name
  // arrived fully formed the instant the line was crossed, which read on the
  // device as it "appearing out of nowhere" (owner report, 2026-08-18). Driven
  // off the scroll offset itself, it tracks the finger and reverses exactly on
  // the way back up. Measured, not a constant: the header grows with the Arabic
  // size setting and the OS font scale.
  const scrollY = useSharedValue(0);
  const headerHeight = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const titleStyle = useAnimatedStyle(() => {
    // Until the header has measured there is no threshold to cross, and the
    // title stays hidden rather than fading in at the very top of the surah.
    if (headerHeight.value <= 0) return { opacity: 0, transform: [{ translateY: 0 }] };

    const end = headerHeight.value - TITLE_FADE_END;

    if (reducedMotion) {
      // No travel and no ramp: a fade is still motion, and this setting is a
      // standing instruction not to animate.
      return { opacity: scrollY.value > end ? 1 : 0, transform: [{ translateY: 0 }] };
    }

    const progress = interpolate(
      scrollY.value,
      [end - TITLE_FADE_DISTANCE, end],
      [0, 1],
      Extrapolation.CLAMP,
    );

    return { opacity: progress, transform: [{ translateY: (1 - progress) * TITLE_RISE }] };
  });

  useEffect(() => {
    navigation.setOptions({
      // The whole bar, not headerTitle/headerRight: the reader's chrome is one
      // glass surface with the bloom behind it (owner ruling 2026-08-25,
      // mockup 1e), and a native toolbar cannot be that. Everything the
      // toolbar provided is now ReaderHeader's -- the back affordance included.
      //
      // `header`, not `headerTransparent`: a transparent header stops the
      // navigator insetting the content, and every screen's own heading then
      // renders underneath the back arrow (see app/_layout.tsx).
      header: () => (
        <ReaderHeader
          surahName={data.surah.name_translit}
          titleStyle={titleStyle}
          mode={readerMode}
          onChangeMode={onChangeReaderMode}
          uiLocale={uiLocale}
          onBack={() => {
            closeSheet();
            navigation.goBack();
          }}
          // Each of these closes the word sheet first. The bar sits above the
          // sheet's backdrop rather than inside it, so leaving the sheet
          // mounted holds the ayah list at no-hide-descendants behind whatever
          // opens next -- coming back from the grid then lands on a stale
          // sheet over an unreachable list.
          onOpenSearch={() => {
            closeSheet();
            router.push('/search');
          }}
          onOpenLanguage={() => {
            closeSheet();
            setLanguageOpen(true);
          }}
          onOpenWbw={() => {
            closeSheet();
            router.push(`/surah/${data.surah.id}/words`);
          }}
        />
      ),
    });
    // closeSheet is declared after this effect (it needs openWord and
    // requestRef), so it cannot sit in the dependency array without a
    // temporal-dead-zone error -- but calling it from these handlers is safe:
    // they only run once the whole component body has evaluated.
  }, [
    navigation,
    titleStyle,
    uiLocale,
    readerMode,
    onChangeReaderMode,
    data.surah.id,
    data.surah.name_translit,
  ]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // A shared value, not state: this runs on every scroll frame and setting
      // state here re-rendered the whole navigator.
      scrollY.value = event.nativeEvent.contentOffset.y;
    },
    [scrollY],
  );

  // The surah's opening, above ayah 1's card rather than inside it: in the card
  // it sat under the ayah number and bookmark row and still read as ayah 1's
  // own first line (owner device report, 2026-08-17). Taken off ayah 1's text
  // rather than held as a constant, so the banner carries that surah's own
  // spelling -- 95 and 97 differ -- and AyahText strips exactly what shows here.
  const basmala = useMemo(() => {
    const first = data.ayahs.find((item) => item.ayah.ayah_number === 1);
    if (!first) return null;
    return splitBasmala(first.ayah.text_uthmani, { surahId: data.surah.id, ayahNumber: 1 }).basmala;
  }, [data.ayahs, data.surah.id]);

  const initialIndex = useMemo(() => {
    if (!initialAyahNumber) return -1;
    return data.ayahs.findIndex((item) => item.ayah.ayah_number === initialAyahNumber);
  }, [data.ayahs, initialAyahNumber]);

  useEffect(() => {
    // -1 means the ayah is not in this surah; 0 means the list already opens
    // on it. Neither is a landing, and both must reveal the reader at once.
    if (initialIndex <= 0) {
      positionedRef.current = true;
      setPositioned(true);
      return;
    }

    // Reset, not left from the previous landing: an `ayah` param change on an
    // already-mounted reader (an external deep link into the surah on screen)
    // re-runs this effect without remounting, and a stale `true` reveals the
    // list mid-scroll and lets onViewableItemsChanged write every ayah the
    // jump passes over into the saved reading position.
    positionedRef.current = false;
    setPositioned(false);

    let cancelled = false;
    attemptsRef.current = 0;
    // -1, not the live height: a re-run must scroll at least twice before it
    // can call anything settled, or the first tick reveals on a comparison
    // against a height nothing has scrolled over yet.
    settledHeightRef.current = -1;

    const reveal = () => {
      if (cancelled) return;
      positionedRef.current = true;
      setPositioned(true);
    };

    const attempt = () => {
      if (cancelled) return;
      failedRef.current = false;
      attemptsRef.current += 1;
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      retryTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        // Both halves: no miss, and no growth under the jump.
        const landed = !failedRef.current && contentHeightRef.current === settledHeightRef.current;
        settledHeightRef.current = contentHeightRef.current;
        if (landed) return reveal();
        // Capped: a row that never measures has to settle. Showing the reader
        // in the wrong place is bad; leaving it behind a spinner for as long
        // as the screen is open is worse.
        if (attemptsRef.current >= MAX_SCROLL_ATTEMPTS) return reveal();
        attempt();
      }, SCROLL_RETRY_DELAY_MS);
    };

    attempt();
    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [initialIndex]);

  // Records the miss and nothing else -- see the note above MAX_SCROLL_ATTEMPTS
  // for what the offset estimate that used to live here cost.
  const onScrollToIndexFailed = useCallback(() => {
    failedRef.current = true;
  }, []);
  // Read by the landing loop above, one tick later -- not state: it changes on
  // every layout pass while the surah settles and none of them is a render.
  const onContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeightRef.current = height;
  }, []);
  const onReadingAyahRef = useRef(onReadingAyah);
  const loadWordsRef = useRef(loadWords);
  const ayahsRef = useRef(data.ayahs);
  // In an effect, not during render: a render React discards would otherwise
  // leave the ref pointing at a callback that never committed, and FlatList
  // calls onViewableItemsChanged outside the React tree, so it would happily
  // invoke it. (Not useEffectEvent -- that is only callable from an Effect.)
  useEffect(() => {
    onReadingAyahRef.current = onReadingAyah;
    loadWordsRef.current = loadWords;
    ayahsRef.current = data.ayahs;
  }, [onReadingAyah, loadWords, data.ayahs]);

  const [wordsByAyah, setWordsByAyah] = useState<Map<number, Word[]>>(new Map());
  // Separate from the state map, and written before the await:
  // onViewableItemsChanged fires on every scroll frame that changes the set,
  // so a check against state alone would issue a fresh query per frame for as
  // long as the first one is still in flight.
  const requestedRef = useRef(new Set<number>());

  const fetchWordsRef = useRef(async (ayahId: number) => {
    const load = loadWordsRef.current;
    if (!load) return;
    const ayahs = ayahsRef.current;
    const start = ayahs.findIndex((item) => item.ayah.id === ayahId);
    if (start < 0) return;

    await Promise.all(
      ayahs.slice(start, start + 1 + WORD_LOOKAHEAD).map(async (item) => {
        const id = item.ayah.id;
        if (requestedRef.current.has(id)) return;
        requestedRef.current.add(id);
        try {
          const words = await load(id);
          setWordsByAyah((current) => new Map(current).set(id, words));
        } catch (cause) {
          // Cleared so the next scroll past this ayah tries again, rather than
          // leaving it permanently untappable. Logged for logcat, never shown:
          // the ayah still renders its text, so there is nothing for the
          // reader to act on.
          requestedRef.current.delete(id);
          console.error('[reader] word load failed', { ayahId: id, cause });
        }
      }),
    );
  });

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const firstVisibleAyah = viewableItems[0]?.item as ReaderAyah | undefined;
    // Not until the deep-link scroll has landed: the rows visible mid-landing
    // are wherever the list happens to be, and recording one overwrites the
    // saved reading position with an ayah nobody read.
    if (positionedRef.current && firstVisibleAyah) {
      onReadingAyahRef.current?.(firstVisibleAyah.ayah.ayah_number);
    }
    for (const token of viewableItems) {
      const item = token.item as ReaderAyah | undefined;
      // Prefetching is not gated: it is a read, it is idempotent, and the rows
      // around the target are exactly the ones about to be needed.
      if (item) void fetchWordsRef.current(item.ayah.id);
    }
  });

  const [openWord, setOpenWord] = useState<WordSummary | null>(null);

  // Same guard WbwScreen carries, for the same reason: two taps can be in
  // flight together -- the first is the slow one, since it warms the surah's
  // gloss cache -- so without the sequence check the sheet shows whichever
  // query finished last rather than the word tapped last, and nothing on
  // screen says so. Bumped on close too, so an in-flight tap cannot re-open
  // the sheet the user has just dismissed.
  const requestRef = useRef(0);

  const onWordPress = useCallback(
    (word: Word) => {
      if (!loadWordSummary) return;
      const request = (requestRef.current += 1);
      loadWordSummary(word)
        .then((summary) => {
          if (requestRef.current === request) setOpenWord(summary);
        })
        .catch((cause: unknown) => {
          // Nothing opens. A sheet with the morphology missing would look like
          // the word has none, which is never true.
          console.error('[reader] word summary failed', { wordId: word.id, cause });
        });
    },
    [loadWordSummary],
  );

  const closeSheet = useCallback(() => {
    requestRef.current += 1;
    setOpenWord(null);
  }, []);

  const ayahNumberOf = useCallback(
    (word: Word) => data.ayahs.find((item) => item.ayah.id === word.ayah_id)?.ayah.ayah_number,
    [data.ayahs],
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={data.ayahs}
        keyExtractor={(item) => String(item.ayah.id)}
        ListHeaderComponent={
          <View
            onLayout={(event: LayoutChangeEvent) => {
              headerHeight.value = event.nativeEvent.layout.height;
            }}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 16,
              gap: 6,
            }}
          >
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}>
              {data.surah.name_translit}
            </Text>
            <Text style={{ color: theme.mutedText }}>{data.surah.name_translation}</Text>
            {basmala ? <Bismillah text={basmala} uiLocale={uiLocale} /> : null}
          </View>
        }
        renderItem={({ item }) => {
          // Two renderers, one list. Everything the list does around them --
          // the landing sequence, viewability tracking, the sheets, the retry
          // loop -- is mode-blind, and both renderers expose the same testIDs
          // and the same word tap targets, so nothing below this line has to
          // know which one is mounted.
          const shared = {
            surahId: data.surah.id,
            ayahNumber: item.ayah.ayah_number,
            arabicText: item.ayah.text_uthmani,
            words: wordsByAyah.get(item.ayah.id) ?? EMPTY_WORDS,
            bookmarked: bookmarkedAyahs.has(item.ayah.ayah_number),
            playing: playingAyah === item.ayah.ayah_number,
            uiLocale,
            audioDisabled: !audioEnabled,
            onToggleBookmark,
            onToggleAudio,
            onWordPress,
          };
          return readerMode === 'mushaf' ? (
            <MushafAyah {...shared} />
          ) : (
            <AyahCard {...shared} translationText={item.translation?.text ?? null} />
          );
        }}
        onViewableItemsChanged={onViewableItemsChanged.current}
        onScrollToIndexFailed={onScrollToIndexFailed}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // BottomSheet -- the shell under both WordSheet and LanguageSheet --
        // sets role="dialog"/aria-modal, but accessibilityViewIsModal is
        // iOS-only, so on Android the ayah text and both card buttons stay
        // reachable by TalkBack swipe while either sheet covers them and the
        // modal is only visually modal (CLAUDE.md §8, WCAG AA). The nav header
        // is a native toolbar outside this View and is still reachable.
        importantForAccessibility={openWord || languageOpen ? 'no-hide-descendants' : 'auto'}
        initialNumToRender={initialIndex > 0 ? initialIndex + 1 : DEFAULT_INITIAL_RENDER}
        style={{ flex: 1, opacity: positioned ? 1 : 0 }}
        contentContainerStyle={{ paddingBottom }}
      />
      {/* Over the list rather than instead of it: the list has to be mounted
          and laid out for the scroll to have anything to land on. Opacity, not
          a conditional render, for the same reason. */}
      {positioned ? null : (
        <View
          testID="reader-positioning"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.background,
          }}
        >
          <ActivityIndicator />
        </View>
      )}
      <WordSheet
        summary={openWord}
        uiLocale={uiLocale}
        onClose={closeSheet}
        onOpenDetail={(word) => {
          const ayahNumber = ayahNumberOf(word);
          if (ayahNumber === undefined) return;
          closeSheet();
          router.push(`/word/${data.surah.id}/${ayahNumber}/${word.position}`);
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
          onChange={onChangeContentLanguage}
          onClose={() => setLanguageOpen(false)}
        />
      ) : null}
    </View>
  );
}
