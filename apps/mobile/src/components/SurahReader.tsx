import { FlatList, Text, View } from 'react-native';
import type { SurahReaderData } from '@/data/corpusRepository';
import { colors } from '@/theme/tokens';
import { AyahCard } from './AyahCard';

interface SurahReaderProps {
  data: SurahReaderData;
  bookmarkedAyahs: Set<number>;
  playingAyah: number | null;
  audioEnabled: boolean;
  onToggleBookmark: (ayahNumber: number) => void;
  onToggleAudio: (ayahNumber: number) => void;
}

export function SurahReader({
  data,
  bookmarkedAyahs,
  playingAyah,
  audioEnabled,
  onToggleBookmark,
  onToggleAudio,
}: SurahReaderProps) {
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
          audioDisabled={!audioEnabled}
          onToggleBookmark={onToggleBookmark}
          onToggleAudio={onToggleAudio}
        />
      )}
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}
