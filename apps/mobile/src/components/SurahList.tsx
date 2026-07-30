import { FlatList, Pressable, Text, View, type ListRenderItem } from 'react-native';
import type { SurahListItem } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { colors, touchTargets } from '@/theme/tokens';

interface SurahListProps {
  surahs: SurahListItem[];
  uiLocale: UiLocaleCode;
  onOpenSurah: (surah: SurahListItem) => void;
}

const rowHeight = 76;

export function SurahList({ surahs, uiLocale, onOpenSurah }: SurahListProps) {
  const ayahsSuffix = t(uiLocale, 'surahList.ayahsSuffix');
  const renderItem: ListRenderItem<SurahListItem> = ({ item }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.nameTranslit}, ${item.ayahCount} ${ayahsSuffix}`}
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
          {item.nameTranslation} · {item.ayahCount} {ayahsSuffix}
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
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}
