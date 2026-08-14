import { useEffect, useRef } from 'react';
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
  onToggleBookmark: (ayahNumber: number) => void;
  onToggleAudio: (ayahNumber: number) => void;
  onReadingAyah?: (ayahNumber: number) => void;
}

export function SurahReader({
  data,
  bookmarkedAyahs,
  playingAyah,
  audioEnabled,
  uiLocale,
  onToggleBookmark,
  onToggleAudio,
  onReadingAyah,
}: SurahReaderProps) {
  const theme = useThemeColors();
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
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}
