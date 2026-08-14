import { Text, View } from 'react-native';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { colors } from '@/theme/tokens';

export default function HomeTab() {
  const { uiLocale } = useAppSettings();

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, padding: 20, gap: 12 }}>
      <Text style={{ color: colors.ink, fontSize: 24, fontWeight: '700' }}>{t(uiLocale, 'home.continue')}</Text>
      <Text style={{ color: colors.muted }}>{t(uiLocale, 'home.noHistory')}</Text>
    </View>
  );
}
