import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View, type ViewToken } from 'react-native';
import { router, useNavigation } from 'expo-router';
import type { Word } from '@quran-corpus/data/mobile';
import type { ReaderAyah, SurahReaderData, WordSummary } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';

import { AyahCard } from './AyahCard';
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

  // Fixed, not scrolled away with the title: the nav header exists as of the
  // M3b header pass, so the reader's one action no longer has to ride the list.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          testID="open-wbw"
          accessibilityRole="button"
          accessibilityLabel={t(uiLocale, 'wbw.title')}
          onPress={() => router.push(`/surah/${data.surah.id}/words`)}
          style={{
            minHeight: touchTargets.minimum,
            minWidth: touchTargets.minimum,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="words" color={theme.accent} />
        </Pressable>
      ),
    });
  }, [navigation, data.surah.id, uiLocale, theme.accent]);

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
        // WordSheet sets role="dialog"/aria-modal, but accessibilityViewIsModal
        // is iOS-only -- on Android the ayah text and both card buttons stay
        // reachable by TalkBack swipe while the sheet covers them, so the
        // modal is only visually modal (CLAUDE.md §8, WCAG AA).
        importantForAccessibility={openWord ? 'no-hide-descendants' : 'auto'}
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
    </View>
  );
}
