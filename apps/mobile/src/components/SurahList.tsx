import { FlatList, Pressable, Text, View, type ListRenderItem } from 'react-native';
import type { SurahListItem } from '@/data/corpusRepository';
import { colors, touchTargets } from '@/theme/tokens';

interface SurahListProps {
  surahs: SurahListItem[];
  onOpenSurah: (surah: SurahListItem) => void;
}

const rowHeight = 76;

export function SurahList({ surahs, onOpenSurah }: SurahListProps) {
  const renderItem: ListRenderItem<SurahListItem> = ({ item }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.nameTranslit}, ${item.ayahCount} ayahs`}
      onPress={() => onOpenSurah(item)}
      style={{
        minHeight: rowHeight,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <View style={{ flex: 1, gap: 4, minHeight: touchTargets.minimum }}>
        <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '600' }}>{item.nameTranslit}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {item.nameTranslation} · {item.ayahCount} ayahs
        </Text>
      </View>
      <Text style={{ color: colors.ink, fontFamily: 'Hafs', fontSize: 28, textAlign: 'right' }}>{item.nameArabic}</Text>
    </Pressable>
  );

  return (
    <FlatList
      data={surahs}
      renderItem={renderItem}
      keyExtractor={(item) => String(item.id)}
      getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}
