import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { useAyahAudioController } from '@/audio/ayahAudio';
import { LanguageSelector } from '@/components/LanguageSelector';
import { SurahReader } from '@/components/SurahReader';
import { getSurahReader, type SurahReaderData } from '@/data/corpusRepository';
import { createLatestReadingPositionRecorder } from '@/data/latestReadingPositionRecorder';
import { openCorpusDb } from '@/data/openCorpusDb';
import { openUserDb } from '@/data/userDb';
import { getBookmarks, recordReadingPosition, setBookmark } from '@/data/userRepository';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { useThemeColors } from '@/theme/themeContext';

function errorTextStyle(danger: string) {
  return { color: danger, padding: 20 };
}

function parseSurahId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 114) return null;
  return parsed;
}

export default function SurahRoute() {
  const params = useLocalSearchParams<{ surahId: string }>();
  const surahId = useMemo(() => parseSurahId(params.surahId), [params.surahId]);
  const { contentLanguage, setContentLanguage, uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const audio = useAyahAudioController(process.env.EXPO_PUBLIC_AUDIO_API_BASE_URL, surahId);
  const [reader, setReader] = useState<SurahReaderData | null>(null);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Two error slots, not one. Reading-position writes are driven by scrolling,
  // so a single shared slot let a background write silently wipe the bookmark
  // failure the user was still reading -- their bookmark stayed unsaved with
  // nothing on screen to say so.
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [readingError, setReadingError] = useState<string | null>(null);
  const readingRecorder = useMemo(() => {
    if (!surahId) return null;
    return createLatestReadingPositionRecorder(async (ayahNumber) => {
      setReadingError(null);
      const userDb = await openUserDb();
      const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
      await recordReadingPosition(userClient, surahId, ayahNumber);
    }, setReadingError);
  }, [surahId]);

  useEffect(() => {
    let cancelled = false;

    async function loadReader() {
      if (!surahId) {
        setError('Invalid surah');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setBookmarkError(null);
      setReadingError(null);

      try {
        const [corpusDb, userDb] = await Promise.all([openCorpusDb(), openUserDb()]);
        const corpusClient = createExpoSqliteClient(corpusDb as ExpoSqliteLike);
        const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
        const [data, savedBookmarks] = await Promise.all([
          getSurahReader(corpusClient, surahId, contentLanguage),
          getBookmarks(userClient),
        ]);

        if (!cancelled) {
          setReader(data);
          setBookmarks(
            new Set(
              savedBookmarks
                .filter((bookmark) => bookmark.surahId === surahId)
                .map((bookmark) => bookmark.ayahNumber),
            ),
          );
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : t(uiLocale, 'reader.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReader();
    return () => {
      cancelled = true;
    };
  }, [contentLanguage, surahId]);

  async function toggleBookmark(ayahNumber: number) {
    if (!surahId) return;
    const nextBookmarked = !bookmarks.has(ayahNumber);
    const previousBookmarks = new Set(bookmarks);
    setBookmarks((current) => {
      const next = new Set(current);
      if (nextBookmarked) next.add(ayahNumber);
      else next.delete(ayahNumber);
      return next;
    });

    try {
      setBookmarkError(null);
      const userDb = await openUserDb();
      const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
      await setBookmark(userClient, surahId, ayahNumber, nextBookmarked);
    } catch (cause) {
      setBookmarks(previousBookmarks);
      setBookmarkError(cause instanceof Error ? cause.message : t(uiLocale, 'reader.bookmarkFailed'));
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !reader) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: theme.background }}>
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
          {error ?? t(uiLocale, 'reader.loadFailed')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <LanguageSelector value={contentLanguage} onChange={setContentLanguage} />
      <SurahReader
        data={reader}
        bookmarkedAyahs={bookmarks}
        playingAyah={audio.playingAyah}
        audioEnabled={audio.audioEnabled}
        uiLocale={uiLocale}
        onToggleBookmark={toggleBookmark}
        onToggleAudio={audio.toggleAyah}
        onReadingAyah={(ayahNumber) => {
          readingRecorder?.record(ayahNumber);
        }}
      />
      {/* Live regions: a bookmark or playback failure happens after the tap,
          with nothing taking focus, so TalkBack would otherwise never announce
          that the action the user just took did not work. */}
      {bookmarkError ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={errorTextStyle(theme.danger)}>
          {bookmarkError}
        </Text>
      ) : null}
      {readingError ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={errorTextStyle(theme.danger)}>
          {readingError}
        </Text>
      ) : null}
      {audio.audioError ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={errorTextStyle(theme.danger)}>
          {audio.audioError}
        </Text>
      ) : null}
    </View>
  );
}
