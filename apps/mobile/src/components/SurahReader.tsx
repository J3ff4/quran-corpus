import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, Text, View, type ViewToken } from 'react-native';
import type { SurahReaderData } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';

import { AyahCard } from './AyahCard';
import { useThemeColors } from '@/theme/themeContext';

interface SurahReaderProps {
  data: SurahReaderData;
  bookmarkedAyahs: Set<number>;
  playingAyah: number | null;
  audioEnabled: boolean;
  uiLocale: UiLocaleCode;
  /** Ayah to open at, from a bookmark or the saved reading position. */
  initialAyahNumber?: number | null;
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

export function SurahReader({
  data,
  bookmarkedAyahs,
  playingAyah,
  audioEnabled,
  uiLocale,
  initialAyahNumber,
  onToggleBookmark,
  onToggleAudio,
  onReadingAyah,
}: SurahReaderProps) {
  const theme = useThemeColors();
  const listRef = useRef<FlatList<SurahReaderData['ayahs'][number]>>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);

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
  // In an effect, not during render: a render React discards would otherwise
  // leave the ref pointing at a callback that never committed, and FlatList
  // calls onViewableItemsChanged outside the React tree, so it would happily
  // invoke it. (Not useEffectEvent -- that is only callable from an Effect.)
  useEffect(() => {
    onReadingAyahRef.current = onReadingAyah;
  }, [onReadingAyah]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const firstVisibleAyah = viewableItems[0]?.item as SurahReaderData['ayahs'][number] | undefined;
    if (firstVisibleAyah) onReadingAyahRef.current?.(firstVisibleAyah.ayah.ayah_number);
  });

  return (
    <FlatList
      ref={listRef}
      data={data.ayahs}
      keyExtractor={(item) => String(item.ayah.id)}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 6 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}>
            {data.surah.name_translit}
          </Text>
          <Text style={{ color: theme.mutedText }}>{data.surah.name_translation}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <AyahCard
          ayahNumber={item.ayah.ayah_number}
          arabicText={item.ayah.text_uthmani}
          translationText={item.translation?.text ?? null}
          bookmarked={bookmarkedAyahs.has(item.ayah.ayah_number)}
          playing={playingAyah === item.ayah.ayah_number}
          uiLocale={uiLocale}
          audioDisabled={!audioEnabled}
          onToggleBookmark={onToggleBookmark}
          onToggleAudio={onToggleAudio}
        />
      )}
      onViewableItemsChanged={onViewableItemsChanged.current}
      onScrollToIndexFailed={onScrollToIndexFailed}
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}
