import { ScrollView, Text, View } from 'react-native';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { colors } from '@/theme/tokens';

const sourceRows = [
  'Arabic Quran text: Tanzil Uthmani XML via existing PWA importer. Source approval incomplete.',
  'English translation: Saheeh International. Source approval incomplete.',
  'Uzbek translation: Muhammad Sodik Muhammad Yusuf. Source approval incomplete.',
  'Russian translation: Abu Adel. Source approval incomplete.',
  'Hafs font: apps/mobile/assets/fonts/hafs.18.woff2. Source approval incomplete.',
  'Abdul Rashid Sufi audio metadata: Source approval incomplete.',
];

export default function AboutRoute() {
  const { uiLocale } = useAppSettings();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text style={{ color: colors.ink, fontSize: 24, fontWeight: '700' }}>{t(uiLocale, 'about.title')}</Text>
      <Text style={{ color: colors.danger, fontWeight: '700' }}>Source approval incomplete</Text>
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '600' }}>{t(uiLocale, 'about.credits')}</Text>
        {sourceRows.map((row) => (
          <Text key={row} style={{ color: colors.muted, lineHeight: 22 }}>
            {row}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}
