import { Link } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { t, type UiStringKey } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const ROWS: { href: string; label: UiStringKey }[] = [
  { href: '/bookmarks', label: 'menu.bookmarks' },
  { href: '/settings', label: 'menu.settings' },
  { href: '/about', label: 'menu.about' },
];

/** The fifth tab. Bookmarks and Settings gave up their own slots so Dictionary
 *  could have one; this is where they went. No logic of its own. */
export function MenuScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 20 }}>
        {ROWS.map((row) => (
          <Link
            key={row.href}
            href={row.href}
            accessibilityRole="link"
            style={{
              color: theme.text,
              fontSize: 17,
              paddingVertical: 16,
              minHeight: touchTargets.minimum,
              borderBottomColor: theme.border,
              borderBottomWidth: 1,
            }}
          >
            {t(uiLocale, row.label)}
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}
