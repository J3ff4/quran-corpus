import { ScrollView, Text, View } from 'react-native';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

const sourceRows = [
  'about.sourceArabic',
  'about.sourceEnglish',
  'about.sourceUzbek',
  'about.sourceRussian',
  'about.sourceHafs',
  'about.sourceAudio',
] as const;

export default function AboutRoute() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom }}>
      <Text style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}>{t(uiLocale, 'about.title')}</Text>
      <Text style={{ color: theme.danger, fontWeight: '700' }}>{t(uiLocale, 'about.sourceApprovalIncomplete')}</Text>
      <View style={{ gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '600' }}>{t(uiLocale, 'about.credits')}</Text>
        {sourceRows.map((row) => (
          <Text key={row} style={{ color: theme.mutedText, lineHeight: 22 }}>
            {t(uiLocale, row)}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}
