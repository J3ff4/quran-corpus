import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';
import { useAyahAudioController } from '@/audio/ayahAudio';
import { LanguageSelector } from '@/components/LanguageSelector';
import { SurahReader } from '@/components/SurahReader';
import type { Word } from '@quran-corpus/data/mobile';
import {
  getSurahGlosses,
  getSurahReader,
  getWordsForAyah,
  getWordSummary,
  type SurahReaderData,
} from '@/data/corpusRepository';
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

// 286 is al-Baqarah, the longest surah; a row that does not exist in this
// surah simply resolves to no index and the reader opens at the top.
function parseAyahNumber(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 286) return null;
  return parsed;
}

export default function SurahRoute() {
  const params = useLocalSearchParams<{ surahId: string; ayah?: string }>();
  const surahId = useMemo(() => parseSurahId(params.surahId), [params.surahId]);
  // Bookmarks and the Home tab's continue link both carry the ayah they mean.
  // Validated the same way as surahId -- it arrives from a URL, so it is
  // untrusted input even when we are the only ones writing the links.
  const initialAyahNumber = useMemo(() => parseAyahNumber(params.ayah), [params.ayah]);
  const { contentLanguage, setContentLanguage, uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const audio = useAyahAudioController(process.env.EXPO_PUBLIC_AUDIO_API_BASE_URL, surahId);
  const [reader, setReader] = useState<SurahReaderData | null>(null);
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

  // One query per surah, not per word tap: getSurahGlosses returns the whole
  // surah's glosses, and al-Baqarah's are 6,116 rows.
  const glossesRef = useRef<{ key: string; glosses: Map<number, string> } | null>(null);
  const loadWordSummary = useCallback(
    async (word: Word) => {
      if (!corpusClient || !surahId) throw new Error('reader is not loaded');
      const key = `${surahId}:${contentLanguage}`;
      if (glossesRef.current?.key !== key) {
        glossesRef.current = {
          key,
          glosses: await getSurahGlosses(corpusClient, surahId, contentLanguage),
        };
      }
      return getWordSummary(corpusClient, word, glossesRef.current.glosses.get(word.id) ?? null);
    },
    [contentLanguage, corpusClient, surahId],
  );

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
      {audio.audioError ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={errorTextStyle(theme.danger)}>
          {t(uiLocale, audio.audioError)}
        </Text>
      ) : null}
    </View>
  );
}
