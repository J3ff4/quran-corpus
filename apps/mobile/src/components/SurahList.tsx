import { FlatList, Pressable, Text, View, type ListRenderItem } from 'react-native';
import type { SurahListItem } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

interface SurahListProps {
  surahs: SurahListItem[];
  uiLocale: UiLocaleCode;
  onOpenSurah: (surah: SurahListItem) => void;
}

const rowHeight = 76;

export function SurahList({ surahs, uiLocale, onOpenSurah }: SurahListProps) {
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
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
        borderBottomColor: theme.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <View style={{ flex: 1, gap: 4, minHeight: touchTargets.minimum }}>
        <Text style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>{item.nameTranslit}</Text>
        <Text style={{ color: theme.mutedText, fontSize: 13 }}>
          {item.nameTranslation} · {item.ayahCount} {ayahsSuffix}
        </Text>
      </View>
      <Text style={{ color: theme.text, fontFamily: 'Hafs', fontSize: 28, textAlign: 'right' }}>{item.nameArabic}</Text>
    </Pressable>
  );

  return (
    <FlatList
      data={surahs}
      renderItem={renderItem}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={{ paddingBottom }}
    />
  );
}
