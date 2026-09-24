import { Link, router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { HeaderCard } from '@/components/HeaderCard';
import { getLastReadingPosition } from '@/data/userRepository';
import { useUserDbOnFocus } from '@/data/useUserDbOnFocus';
import { t } from '@/i18n/uiStrings';
import { WbwScreen } from '@/screens/WbwScreen';
import { useAppSettings } from '@/settings/settingsStore';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/**
 * Word-by-word, opening on wherever the reader left off. The empty state below
 * is the only thing it shows on a fresh install, where there is no position to
 * open.
 *
 * A Menu row rather than a tab since M7d: the mushaf took the fifth slot, and
 * of the two this is the one already reachable from the reader's own chips.
 */
export default function MorphologyRoute() {
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
  // one. Excluded by the `loading` return, not by a term per row.
  // Rendered here, not redirected to. A <Redirect> out of the (tabs) group
  // took the tab bar with it and pushed no history entry, so Android back
  // popped an empty stack and killed the app (owner device report,
  // 2026-08-16). The tab is a screen; back out of a tab root exiting is the
  // platform's own behaviour.
  if (!error && position) {
    return <WbwScreen surahId={position.surahId} from={position.ayahNumber} />;
  }

  // No chrome while the position read is in flight. The card below belongs to
  // the empty state, and a reader who HAS a position never lands on it -- but
  // drawn during the read it painted a full header titled "Word by Word", which
  // WbwScreen's own header then replaced one async gate later. Two cards for
  // one screen entry, reported as a flash (owner, 2026-09-24). Pre-M12 this
  // branch drew a bare heading, so the swap was invisible; the card made it
  // visible. Spinner only, and WbwScreen paints the only header there is.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // The route runs `headerShown: false` so that WbwScreen's own HeaderCard is
  // the only back button on the screen -- which leaves every branch that is
  // NOT WbwScreen owing its own. On a fresh install there is no position to
  // open, so this is the first thing the Menu row shows: without the card it
  // had no way back at all and drew its heading under the status bar.
  return (
    <View style={{ flex: 1 }}>
      <HeaderCard
        title={t(uiLocale, 'wbw.title')}
        onBack={() => router.back()}
        uiLocale={uiLocale}
        testIDPrefix="wbw"
      />
      <View style={{ flex: 1, padding: 20, gap: 12 }}>
        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
            {error}
          </Text>
        ) : null}
        {!error ? (
          <>
            <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'morphology.noHistory')}</Text>
            {/* The Menu row is reachable before anything has been read, so it
                needs a way forward rather than a dead end. */}
            <Link href="/surahs" accessibilityRole="link" style={{ color: theme.accent, fontSize: typography.body }}>
              {t(uiLocale, 'tabs.surahs')}
            </Link>
          </>
        ) : null}
      </View>
    </View>
  );
}
