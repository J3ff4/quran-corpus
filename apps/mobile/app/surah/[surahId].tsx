import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';
import { useRecitation } from '@/audio/ayahAudio';
import { SurahReader } from '@/components/SurahReader';
import { getSurahReader, getWordsForAyah, type SurahReaderData } from '@/data/corpusRepository';
import { createLatestReadingPositionRecorder } from '@/data/latestReadingPositionRecorder';
import { openCorpusDb } from '@/data/openCorpusDb';
import { parseAyahNumber, parseSurahId } from '@/data/routeParams';
import { openUserDb } from '@/data/userDb';
import { useWordSummaryLoader } from '@/data/useWordSummaryLoader';
import { getBookmarks, recordReadingDay, recordReadingPosition, setBookmark } from '@/data/userRepository';
import { localDay } from '@/home/counters';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { useThemeColors } from '@/theme/themeContext';

function errorTextStyle(danger: string) {
  return { color: danger, padding: 20 };
}

export default function SurahRoute() {
  const params = useLocalSearchParams<{ surahId: string; ayah?: string }>();
  const surahId = useMemo(() => parseSurahId(params.surahId), [params.surahId]);
  // Bookmarks and the Home tab's continue link both carry the ayah they mean.
  // Validated the same way as surahId -- it arrives from a URL, so it is
  // untrusted input even when we are the only ones writing the links.
  const initialAyahNumber = useMemo(() => parseAyahNumber(params.ayah), [params.ayah]);
  const { contentLanguage, setContentLanguage, uiLocale, readerMode, setReaderMode, reciterId, setReciterId } =
    useAppSettings();
  const theme = useThemeColors();
  const [reader, setReader] = useState<SurahReaderData | null>(null);
  // ayahCount is what stops continuous play at the end of the surah, so it
  // comes from the loaded surah rather than a constant; 0 until the reader
  // loads, which is also the window in which nothing can be tapped to play.
  //
  // Switching reciter mid-surah changes the voice from the NEXT ayah, not this
  // one: the hook reads reciterId when it starts an ayah, and the one already
  // sounding keeps its source (device check 87).
  const audio = useRecitation(surahId, reader?.surah.ayah_count ?? 0, reciterId, {
    surahName: reader?.surah.name_translit,
  });
  // Kept so the reader can query words for the ayahs scrolling into view,
  // rather than reopening the database on every tap.
  const [corpusClient, setCorpusClient] = useState<MobileDataClient | null>(null);
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
      // Decision 22: any reading counts, and this write already fires on the
      // reader's scroll, so it is the one place that sees every read without a
      // second listener to keep in step.
      try {
        await recordReadingDay(userClient, localDay(new Date()));
      } catch (cause) {
        // Deliberately swallowed. The streak is decoration; the reading
        // position is what the reader came back for and is written above, so
        // letting this reject would show "position not saved" for a position
        // that was in fact saved.
        console.error('[home] reading-day write failed', { cause });
      }
    }, () => setReadingError(t(uiLocale, 'reader.positionFailed')));
  }, [surahId, uiLocale]);

  useEffect(() => {
    let cancelled = false;

    async function loadReader() {
      if (!surahId) {
        setError(t(uiLocale, 'reader.invalidSurah'));
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setBookmarkError(null);
      setReadingError(null);

      try {
        const [corpusDb, userDb] = await Promise.all([openCorpusDb(), openUserDb()]);
        // Not named corpusClient: that is the state this assigns to, and a
        // shadowing local here is a rename away from a silent no-op.
        const client = createExpoSqliteClient(corpusDb as ExpoSqliteLike);
        const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
        const [data, savedBookmarks] = await Promise.all([
          getSurahReader(client, surahId, contentLanguage),
          getBookmarks(userClient),
        ]);

        if (!cancelled) {
          setCorpusClient(client);
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
        // See the note in app/(tabs)/surahs.tsx: logged for logcat, never shown.
        console.error('[reader] load failed', { surahId, cause });
        if (!cancelled) setError(t(uiLocale, 'reader.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReader();
    return () => {
      cancelled = true;
    };
    // uiLocale included: the effect stores a string already translated with the
    // locale it captured, so without this a language switch after a failure
    // leaves the old language on screen.
  }, [contentLanguage, surahId, uiLocale]);

  // One gloss query per surah, not per word tap. Shared with the word-by-word
  // screen, which opens the same sheet off the same database.
  const loadWordSummary = useWordSummaryLoader(corpusClient, surahId, contentLanguage);

  const loadWords = useCallback(
    async (ayahId: number) => {
      if (!corpusClient) return [];
      return getWordsForAyah(corpusClient, ayahId);
    },
    [corpusClient],
  );

  async function toggleBookmark(ayahNumber: number) {
    if (!surahId) return;
    const nextBookmarked = !bookmarks.has(ayahNumber);
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
      console.error('[reader] bookmark write failed', { surahId, ayahNumber, cause });
      // Undo this ayah only, off the current set. Restoring a snapshot taken
      // before the write would also revert any toggle that landed while this
      // one was in flight, leaving the list disagreeing with SQLite until the
      // next focus reload.
      setBookmarks((current) => {
        const next = new Set(current);
        if (nextBookmarked) next.delete(ayahNumber);
        else next.add(ayahNumber);
        return next;
      });
      setBookmarkError(t(uiLocale, 'reader.bookmarkFailed'));
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !reader) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
          {error ?? t(uiLocale, 'reader.loadFailed')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SurahReader
        data={reader}
        bookmarkedAyahs={bookmarks}
        playingAyah={audio.playing ? audio.ayah : null}
        audioEnabled
        recitation={{
          positionSec: audio.positionSec,
          durationSec: audio.durationSec,
          continuous: audio.continuous,
          reciterId,
          onChangeReciter: setReciterId,
          onSkipNext: audio.skipNext,
          onSkipPrevious: audio.skipPrevious,
          onSeek: audio.seekTo,
          onToggleContinuous: () => audio.setContinuous(!audio.continuous),
        }}
        uiLocale={uiLocale}
        contentLanguage={contentLanguage}
        onChangeContentLanguage={setContentLanguage}
        readerMode={readerMode}
        onChangeReaderMode={setReaderMode}
        initialAyahNumber={initialAyahNumber}
        loadWords={loadWords}
        loadWordSummary={loadWordSummary}
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
      {audio.error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={errorTextStyle(theme.danger)}>
          {t(uiLocale, audio.error)}
        </Text>
      ) : null}
    </View>
  );
}
