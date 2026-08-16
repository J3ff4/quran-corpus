import { Link, Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { getLastReadingPosition } from '@/data/userRepository';
import { useUserDbOnFocus } from '@/data/useUserDbOnFocus';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/**
 * The morphology tab is a jump, not a screen: it sends the reader to the
 * word-by-word view of wherever they left off. It only renders anything at all
 * on a fresh install, where there is no position to jump to.
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
  if (!error && position) {
    return <Redirect href={`/surah/${position.surahId}/words?from=${position.ayahNumber}`} />;
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
