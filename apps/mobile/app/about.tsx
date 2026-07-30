import { ScrollView, Text, View } from 'react-native';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { colors } from '@/theme/tokens';

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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text style={{ color: colors.ink, fontSize: 24, fontWeight: '700' }}>{t(uiLocale, 'about.title')}</Text>
      <Text style={{ color: colors.danger, fontWeight: '700' }}>{t(uiLocale, 'about.sourceApprovalIncomplete')}</Text>
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '600' }}>{t(uiLocale, 'about.credits')}</Text>
        {sourceRows.map((row) => (
          <Text key={row} style={{ color: colors.muted, lineHeight: 22 }}>
            {t(uiLocale, row)}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}
