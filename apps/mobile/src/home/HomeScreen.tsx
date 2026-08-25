import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';
import { GlassSurface } from '@/components/GlassSurface';
import { Icon } from '@/components/icons/Icon';
import { getAyahReaderLocation, type ReaderLocation } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import {
  countDistinctRootsViewed,
  getLastReadingPosition,
  getReadingDays,
  getRootViewsByDay,
} from '@/data/userRepository';
import { useUserDbOnFocus } from '@/data/useUserDbOnFocus';
import { ayahForDay } from '@/home/ayahOfTheDay';
import { localDay, streakFrom, weeklyLog, type DailyRoots } from '@/home/counters';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import { usePressScale } from '@/motion/usePressScale';
import { useAppSettings } from '@/settings/settingsStore';
import { fonts, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

/** The whole history, not a window: a streak has no length limit, and a
 *  seven-day cutoff would silently cap a 40-day one at 7 with nothing on
 *  screen to say the number was truncated. One row per day read, so this is a
 *  few thousand rows after a decade. */
const ALL_HISTORY = '1970-01-01';

/** Days the weekly log shows. Matches weeklyLog's own fixed window. */
const WEEK = 7;

const WEEK_BAR_HEIGHT = 44;

/** The counters' display size. Bigger than typography.title: the number is the
 *  card, and the mockup's hierarchy is number over caption. */
const COUNTER_SIZE = 34;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The Home tab: search, where you left off, what you have read, and one ayah.
 *
 * Four independent loads, four independent failures. They are deliberately not
 * merged into one: the reading position, the counters and the day's ayah come
 * from two different databases, and the tab used to blank entirely when any one
 * of them rejected.
 */
export function HomeScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
  const today = localDay(new Date());

  const position = useUserDbOnFocus(getLastReadingPosition, t(uiLocale, 'home.loadFailed'));

  // Two loads rather than one because they fail independently and each card
  // shows its own error; both are wrapped in useCallback so the focus effect
  // does not re-subscribe on every render.
  const readingDays = useUserDbOnFocus(
    useCallback((client: MobileDataClient) => getReadingDays(client, ALL_HISTORY), []),
    t(uiLocale, 'home.countersFailed'),
  );
  const roots = useUserDbOnFocus(
    useCallback(
      async (client: MobileDataClient) => {
        // In parallel: both feed the same card, so a sequential pair only adds
        // a round trip to the screen the app opens on.
        const [total, byDay] = await Promise.all([
          countDistinctRootsViewed(client),
          getRootViewsByDay(client, weekStart(today)),
        ]);
        return { total, byDay };
      },
      [today],
    ),
    t(uiLocale, 'home.countersFailed'),
  );

  const daily = ayahForDay(today);
  const continueAyah = useCorpusAyah(position.data?.surahId ?? null, position.data?.ayahNumber ?? null);
  const dailyAyah = useCorpusAyah(daily.surah, daily.ayah);

  const streak = streakFrom(readingDays.data ?? [], today);
  const week = weeklyLog(roots.data?.byDay ?? [], today);
  const countersError = readingDays.error ?? roots.error;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom }}>
      <SearchPill uiLocale={uiLocale} />

      {position.loading ? <ActivityIndicator /> : null}
      {!position.loading && position.error ? <ErrorLine message={position.error} /> : null}
      {!position.loading && !position.error && !position.data ? (
        <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'home.noHistory')}</Text>
      ) : null}
      {!position.loading && !position.error && position.data ? (
        <ContinueCard
          surahId={position.data.surahId}
          ayahNumber={position.data.ayahNumber}
          location={continueAyah.data}
          uiLocale={uiLocale}
        />
      ) : null}

      {countersError ? <ErrorLine message={countersError} /> : null}
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <CounterCard testID="home-streak" label={t(uiLocale, 'home.streak')} value={streak} />
        <CounterCard
          testID="home-roots"
          label={t(uiLocale, 'home.rootsStudied')}
          value={roots.data?.total ?? 0}
        >
          <WeekLog week={week} uiLocale={uiLocale} />
        </CounterCard>
      </View>

      <AyahOfTheDayCard
        surah={daily.surah}
        ayah={daily.ayah}
        location={dailyAyah.data}
        error={dailyAyah.error ? t(uiLocale, 'reader.loadFailed') : null}
        uiLocale={uiLocale}
      />
    </ScrollView>
  );
}

/** The first day of the log's window: today minus six. */
function weekStart(today: string): string {
  return new Date(Date.parse(`${today}T12:00:00Z`) - (WEEK - 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * One ayah from the bundled corpus, or null while it loads or if it fails.
 *
 * Separate from useUserDbOnFocus: this reads the corpus DB, not the user DB,
 * and it must not re-run on focus -- neither the day's ayah nor the text of a
 * saved position changes while the app is open.
 */
function useCorpusAyah(surahId: number | null, ayahNumber: number | null) {
  const { contentLanguage } = useAppSettings();
  const [state, setState] = useState<{ data: ReaderLocation | null; error: boolean }>({
    data: null,
    error: false,
  });

  useEffect(() => {
    if (surahId == null || ayahNumber == null) {
      setState({ data: null, error: false });
      return;
    }
    let cancelled = false;

    async function load(surah: number, ayah: number) {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getAyahReaderLocation(client, surah, ayah, contentLanguage);
        if (!cancelled) setState({ data: found, error: false });
      } catch (cause) {
        // Logged, not shown verbatim: the driver's message is untranslated
        // English and can name a path on the device.
        console.error('[home] ayah load failed', cause);
        if (!cancelled) setState({ data: null, error: true });
      }
    }

    load(surahId, ayahNumber);
    return () => {
      cancelled = true;
    };
  }, [surahId, ayahNumber, contentLanguage]);

  return state;
}

function ErrorLine({ message }: { message: string }) {
  const theme = useThemeColors();
  return (
    // Live region: nothing here takes focus, so without it TalkBack announces
    // nothing when a load fails.
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
      {message}
    </Text>
  );
}

/** A glass card that scales 3% on press. The whole card is the tap target. */
function PressableCard({
  accessibilityLabel,
  children,
  onPress,
  testID,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  onPress: () => void;
  testID: string;
}) {
  const press = usePressScale();
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.style}
    >
      <GlassSurface style={{ padding: 16, gap: 6 }}>{children}</GlassSurface>
    </AnimatedPressable>
  );
}

function SearchPill({ uiLocale }: { uiLocale: UiLocaleCode }) {
  const theme = useThemeColors();
  const press = usePressScale();
  return (
    <AnimatedPressable
      testID="open-search"
      accessibilityRole="button"
      accessibilityLabel={t(uiLocale, 'search.title')}
      onPress={() => router.push('/search')}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.style}
    >
      <GlassSurface
        radius="pill"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: touchTargets.minimum,
          paddingHorizontal: 18,
        }}
      >
        <Icon name="search" color={theme.mutedText} size={20} />
        <Text style={{ color: theme.mutedText, fontSize: typography.body }}>
          {t(uiLocale, 'search.placeholder')}
        </Text>
      </GlassSurface>
    </AnimatedPressable>
  );
}

function ContinueCard({
  surahId,
  ayahNumber,
  location,
  uiLocale,
}: {
  surahId: number;
  ayahNumber: number;
  location: ReaderLocation | null;
  uiLocale: UiLocaleCode;
}) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();
  return (
    <PressableCard
      testID="home-continue"
      // The visible label is bare coordinates ("2:255"); on its own a screen
      // reader announces two numbers with no indication of what tapping does.
      accessibilityLabel={`${t(uiLocale, 'home.continue')} ${location?.surah.name_translit ?? ''} ${surahId}:${ayahNumber}`}
      onPress={() => openReader(surahId, ayahNumber)}
    >
      <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
        {t(uiLocale, 'home.continue')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ color: theme.text, fontFamily: fonts.displaySemiBold, fontSize: typography.title }}>
          {location?.surah.name_translit ?? ''}
        </Text>
        <Text style={{ color: theme.accent, fontSize: typography.body }}>
          {surahId}:{ayahNumber}
        </Text>
      </View>
      {location ? (
        <Text
          numberOfLines={1}
          style={{
            color: theme.mutedText,
            fontFamily: fonts.arabic,
            fontSize: Math.round(sizes.reader * 0.7),
            textAlign: 'right',
          }}
        >
          {location.ayah.text_uthmani}
        </Text>
      ) : null}
    </PressableCard>
  );
}

/** Half-width glass card: one big number over its label. */
function CounterCard({
  children,
  label,
  testID,
  value,
}: {
  children?: ReactNode;
  label: string;
  testID: string;
  value: number;
}) {
  const theme = useThemeColors();
  return (
    // Not a Pressable: neither counter has a destination, and a button that
    // does nothing when tapped is worse for TalkBack than a labelled panel.
    <GlassSurface testID={testID} style={{ flex: 1, padding: 16, gap: 4 }}>
      {/* Grouped: the number and its label announce as one phrase, where the
          bare "2" on its own says nothing. */}
      <View accessible accessibilityLabel={`${label}: ${value}`}>
        <Text
          testID={`${testID}-value`}
          style={{ color: theme.text, fontFamily: fonts.displaySemiBold, fontSize: COUNTER_SIZE }}
        >
          {value}
        </Text>
        <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>{label}</Text>
      </View>
      {children}
    </GlassSurface>
  );
}

/** Seven bars, oldest first, scaled against the busiest day of the week. */
function WeekLog({ week, uiLocale }: { week: DailyRoots[]; uiLocale: UiLocaleCode }) {
  const theme = useThemeColors();
  // Against the week's own peak, not against each day's own count -- dividing
  // a day by itself makes every non-empty bar full height and the chart says
  // nothing.
  const peak = Math.max(...week.map((day) => day.roots), 1);

  return (
    <View
      accessibilityLabel={t(uiLocale, 'home.rootsThisWeek')}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: WEEK_BAR_HEIGHT, marginTop: 6 }}
    >
      {week.map((day, index) => (
        <View
          key={day.day}
          testID={`home-week-bar-${index}`}
          accessible
          accessibilityLabel={`${day.day}: ${day.roots}`}
          style={{
            flex: 1,
            // A floor of 2px, so an empty day is a visible gap in a row of
            // seven rather than nothing at all.
            height: Math.max(2, Math.round((day.roots / peak) * WEEK_BAR_HEIGHT)),
            borderRadius: 3,
            backgroundColor: day.roots > 0 ? theme.accent : theme.border,
          }}
        />
      ))}
    </View>
  );
}

function AyahOfTheDayCard({
  ayah,
  error,
  location,
  surah,
  uiLocale,
}: {
  ayah: number;
  error: string | null;
  location: ReaderLocation | null;
  surah: number;
  uiLocale: UiLocaleCode;
}) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();
  return (
    <PressableCard
      testID="home-ayah-of-day"
      accessibilityLabel={`${t(uiLocale, 'home.ayahOfTheDay')} ${surah}:${ayah}`}
      onPress={() => openReader(surah, ayah)}
    >
      <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
        {t(uiLocale, 'home.ayahOfTheDay')}
      </Text>
      {/* Rendered even with no text: the card is the way in to the ayah, and a
          failed corpus read must not take the tap target with it. */}
      {error ? <ErrorLine message={error} /> : null}
      {location ? (
        <>
          <Text
            style={{
              color: theme.text,
              fontFamily: fonts.arabic,
              fontSize: sizes.reader,
              lineHeight: Math.round(sizes.reader * 1.9),
              textAlign: 'right',
            }}
          >
            {location.ayah.text_uthmani}
          </Text>
          {location.translation ? (
            <Text style={{ color: theme.mutedText, fontSize: typography.body, lineHeight: 24 }}>
              {location.translation.text}
            </Text>
          ) : null}
          <Text style={{ color: theme.accent, fontSize: typography.caption }}>
            {location.surah.name_translit} {surah}:{ayah}
          </Text>
        </>
      ) : null}
    </PressableCard>
  );
}

function openReader(surahId: number, ayahNumber: number) {
  router.push({
    pathname: '/surah/[surahId]',
    // Without the ayah the link opens the surah at ayah 1, which for
    // al-Baqarah means the saved position is 254 rows away.
    params: { surahId: String(surahId), ayah: String(ayahNumber) },
  });
}
