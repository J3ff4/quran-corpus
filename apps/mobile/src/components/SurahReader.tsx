import { useRef } from 'react';
import { FlatList, Text, View, type ViewToken } from 'react-native';
import type { SurahReaderData } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { colors } from '@/theme/tokens';
import { AyahCard } from './AyahCard';

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
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const firstVisibleAyah = viewableItems[0]?.item as SurahReaderData['ayahs'][number] | undefined;
    if (firstVisibleAyah) onReadingAyah?.(firstVisibleAyah.ayah.ayah_number);
  });

  return (
    <FlatList
      data={data.ayahs}
      keyExtractor={(item) => String(item.ayah.id)}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 6 }}>
          <Text style={{ color: colors.ink, fontSize: 24, fontWeight: '700' }}>{data.surah.name_translit}</Text>
          <Text style={{ color: colors.muted }}>{data.surah.name_translation}</Text>
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
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}
