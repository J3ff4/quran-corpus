import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import { router, useNavigation } from 'expo-router';
import { splitBasmala, type Word } from '@quran-corpus/data/mobile';
import type { ReaderAyah, SurahReaderData, WordSummary } from '@/data/corpusRepository';
import type { ContentLanguageCode, UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';

import { AyahCard } from './AyahCard';
import { Bismillah } from './Bismillah';
import { LanguageSheet } from './LanguageSheet';
import { WordSheet } from './WordSheet';
import { Icon } from './icons/Icon';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

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

// Cards are variable height (Arabic runs wrap differently per ayah), so there
// is no getItemLayout to give FlatList and scrollToIndex fails for any row it
// has not measured yet. The documented recovery is to jump to an estimated
// offset, let the list render there, and retry. Capped so a persistently
// failing scroll settles instead of looping.
const MAX_SCROLL_RETRIES = 5;
const SCROLL_RETRY_DELAY_MS = 120;

// Ayahs fetched ahead of the one scrolling into view. The whole-surah fetch is
// deliberately not restored -- corpusRepository.ts records why (6,116 word rows
// for al-Baqarah). Per-ayah with a lookahead keeps every query bounded and, on
// a local SQLite file, lands before the ayah reaches the middle of the screen.
const WORD_LOOKAHEAD = 3;

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
  initialAyahNumber,
  loadWords,
  loadWordSummary,
  onToggleBookmark,
  onToggleAudio,
  onReadingAyah,
}: SurahReaderProps) {
  const theme = useThemeColors();
  const navigation = useNavigation();
  const listRef = useRef<FlatList<SurahReaderData['ayahs'][number]>>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);

  const [languageOpen, setLanguageOpen] = useState(false);

  // Fixed, not scrolled away with the title: the nav header exists as of the
  // M3b header pass, so the reader's actions no longer ride the list. The
  // language control joined them on 2026-08-17 -- it used to be a fixed pill
  // band above the ayahs, costing a strip of every screenful.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            testID="open-language"
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'reader.chooseLanguage')}
            // closeSheet is declared further down (after openWord/requestRef),
            // so it can't sit in this effect's dependency array without a
            // temporal-dead-zone error -- but it's fine to call from inside
            // this onPress, which only runs after the whole component body,
            // closeSheet included, has finished evaluating. Without this call
            // the globe button stays reachable while WordSheet is up: two
            // stacked absoluteFill backdrops (the header is a native toolbar
            // above WordSheet's, not inside it) and the word panel peeking out
            // from behind the language panel.
            onPress={() => {
              closeSheet();
              setLanguageOpen(true);
            }}
            style={{
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="translate" color={theme.accent} />
          </Pressable>
          <Pressable
            testID="open-wbw"
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'wbw.title')}
            // Same reachability problem as the globe above: this button sits in
            // the native toolbar, outside the sheet's backdrop. Leaving the
            // sheet mounted means coming back from the grid lands on a stale
            // sheet still holding the list at no-hide-descendants.
            onPress={() => {
              closeSheet();
              router.push(`/surah/${data.surah.id}/words`);
            }}
            style={{
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="words" color={theme.accent} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, data.surah.id, uiLocale, theme.accent]);

  // The nav header's title is empty while the list header's 24pt heading is on
  // screen and fills in once it scrolls past -- Android's own app-bar
  // behaviour, and it keeps the surah name on screen at ayah 150 where the list
  // header is long gone. Measured, not a constant: the header grows with the
  // Arabic size setting and the OS font scale.
  const [titleVisible, setTitleVisible] = useState(false);
  const headerHeightRef = useRef(0);

  useEffect(() => {
    navigation.setOptions({ title: titleVisible ? data.surah.name_translit : '' });
  }, [navigation, titleVisible, data.surah.name_translit]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const height = headerHeightRef.current;
      // Until the header has measured, there is no threshold to cross and the
      // title stays empty rather than flipping on at offset 0.
      if (height <= 0) return;
      // 8dp of slack so a heading resting exactly on the boundary does not
      // toggle the title on every scroll frame.
      const next = event.nativeEvent.contentOffset.y > height - 8;
      // Guarded: setOptions on every frame re-renders the whole navigator.
      setTitleVisible((current) => (current === next ? current : next));
    },
    [],
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

  // Index 0 needs no scroll, and -1 means the ayah is not in this surah.
  useEffect(() => {
    if (initialIndex <= 0) return;
    retriesRef.current = 0;
    listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
  }, [initialIndex]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const onScrollToIndexFailed = useCallback(
    ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      if (retriesRef.current >= MAX_SCROLL_RETRIES) return;
      retriesRef.current += 1;
      listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        listRef.current?.scrollToIndex({ index, animated: false });
      }, SCROLL_RETRY_DELAY_MS);
    },
    [],
  );
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
    if (firstVisibleAyah) onReadingAyahRef.current?.(firstVisibleAyah.ayah.ayah_number);
    for (const token of viewableItems) {
      const item = token.item as ReaderAyah | undefined;
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
              headerHeightRef.current = event.nativeEvent.layout.height;
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
        renderItem={({ item }) => (
          <AyahCard
            surahId={data.surah.id}
            ayahNumber={item.ayah.ayah_number}
            arabicText={item.ayah.text_uthmani}
            words={wordsByAyah.get(item.ayah.id) ?? EMPTY_WORDS}
            translationText={item.translation?.text ?? null}
            bookmarked={bookmarkedAyahs.has(item.ayah.ayah_number)}
            playing={playingAyah === item.ayah.ayah_number}
            uiLocale={uiLocale}
            audioDisabled={!audioEnabled}
            onToggleBookmark={onToggleBookmark}
            onToggleAudio={onToggleAudio}
            onWordPress={onWordPress}
          />
        )}
        onViewableItemsChanged={onViewableItemsChanged.current}
        onScrollToIndexFailed={onScrollToIndexFailed}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // BottomSheet -- the shell under both WordSheet and LanguageSheet --
        // sets role="dialog"/aria-modal, but accessibilityViewIsModal is
        // iOS-only, so on Android the ayah text and both card buttons stay
        // reachable by TalkBack swipe while either sheet covers them and the
        // modal is only visually modal (CLAUDE.md §8, WCAG AA). The nav header
        // is a native toolbar outside this View and is still reachable.
        importantForAccessibility={openWord || languageOpen ? 'no-hide-descendants' : 'auto'}
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
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
