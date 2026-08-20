import { Link } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { getLastReadingPosition } from '@/data/userRepository';
import { useUserDbOnFocus } from '@/data/useUserDbOnFocus';
import { t } from '@/i18n/uiStrings';
import { WbwScreen } from '@/screens/WbwScreen';
import { useAppSettings } from '@/settings/settingsStore';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/**
 * The morphology tab opens on the word-by-word view of wherever the reader
 * left off. The empty state below is the only thing it shows on a fresh
 * install, where there is no position to open.
 */
export default function MorphologyTab() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const { data: position, loading, error } = useUserDbOnFocus(
    getLastReadingPosition,
    t(uiLocale, 'home.loadFailed'),
  );

  // No `loading` term: the hook holds `data` at null until the read settles,
  // so a null position is already indistinguishable from "not read yet" here.
  // The empty state below is where loading has to be excluded -- it is the
  // branch that would otherwise flash "no reading history" at a reader who has
  // one.
  // Rendered here, not redirected to. A <Redirect> out of the (tabs) group
  // took the tab bar with it and pushed no history entry, so Android back
  // popped an empty stack and killed the app (owner device report,
  // 2026-08-16). The tab is a screen; back out of a tab root exiting is the
  // platform's own behaviour.
  if (!error && position) {
    return <WbwScreen surahId={position.surahId} from={position.ayahNumber} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 20, gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: typography.title, fontWeight: '700' }}>
        {t(uiLocale, 'wbw.title')}
      </Text>
      {loading ? <ActivityIndicator /> : null}
      {!loading && error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
          {error}
        </Text>
      ) : null}
      {!loading && !error ? (
        <>
          <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'morphology.noHistory')}</Text>
          {/* The tab is reachable before anything has been read, so it needs a
              way forward rather than a dead end. */}
          <Link href="/surahs" accessibilityRole="link" style={{ color: theme.accent, fontSize: typography.body }}>
            {t(uiLocale, 'tabs.surahs')}
          </Link>
        </>
      ) : null}
    </View>
  );
}
