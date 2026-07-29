import { Text, View } from 'react-native';
import { useAppSettings } from '@/settings/settingsStore';
import { t } from '@/i18n/uiStrings';
import { colors } from '@/theme/tokens';

export default function BookmarksTab() {
  const { uiLocale } = useAppSettings();

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: colors.paper }}>
      <Text style={{ color: colors.muted }}>{t(uiLocale, 'tabs.bookmarks')}</Text>
    </View>
  );
}
