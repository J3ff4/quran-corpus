import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
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
import { useEntryPager, useHeldEntry } from '@/motion/entryPager';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { useThemeColors } from '@/theme/themeContext';

function errorTextStyle(danger: string) {
  return { color: danger, padding: 20 };
}

export default function SurahRoute() {
  const params = useLocalSearchParams<{ surahId: string; ayah?: string }>();
  const routeSurahId = useMemo(() => parseSurahId(params.surahId), [params.surahId]);
  // The same pager the dictionary entries use, for the same reason: expo-router
  // remounts a [param] screen when `replace` changes the param, which destroys
  // the outgoing screen before the incoming one renders and runs the
  // navigator's own transition over the top. Paging is state, not navigation
  // (D48), so back returns to the surah list rather than walking every surah
  // paged through.
  const pager = useEntryPager(routeSurahId === null ? null : String(routeSurahId));
  const surahId = pager.current === null ? null : Number(pager.current);
  // Bookmarks and the Home tab's continue link both carry the ayah they mean.
  // Validated the same way as surahId -- it arrives from a URL, so it is
  // untrusted input even when we are the only ones writing the links.
  const routeAyahNumber = useMemo(() => parseAyahNumber(params.ayah), [params.ayah]);
  const { contentLanguage, setContentLanguage, uiLocale, readerMode, setReaderMode, reciterId, setReciterId } =
    useAppSettings();
  const theme = useThemeColors();
  // The surah it was loaded FOR, carried with it. Not read back off the
  // payload: what makes the held copy safe is that it answers the request the
  // pager is on, and only the caller knows which request that was.
  const [reader, setReader] = useState<{ surahId: number; data: SurahReaderData } | null>(null);
  // The surah kept on screen while the next one loads, the same way the
  // dictionary entries page. Without it the chevron read as: the outgoing
  // surah remounts at its top (the key below changes a render before the load
  // effect fires), then a spinner, then the new surah -- three states where
  // the ruling asks for one slide. The id check is what stops it holding a
  // surah the pager has already left.
  const heldReader = useHeldEntry(reader && reader.surahId === surahId ? reader : null);
  const held = heldReader?.data ?? null;
  // What is *on screen*, which during a page turn is not yet what the pager
  // points at. Bookmark and reading-position writes both belong to the surah
  // the reader is actually looking at.
  const displayedSurahId = heldReader?.surahId ?? null;
  // Only while the surah on screen is still the one the route named. Paging is
  // state, so the params do not change when the surah does: carried across,
  // a bookmark opening Al-Baqarah at 2:50 landed the next surah on 3:50.
  // Against the displayed surah rather than the pager's, so the outgoing
  // reader is not re-anchored during the frames it is still sliding out.
  const initialAyahNumber = displayedSurahId === routeSurahId ? routeAyahNumber : null;
  // ayahCount is what stops continuous play at the end of the surah, so it
  // comes from the loaded surah rather than a constant; 0 until the reader
  // loads, which is also the window in which nothing can be tapped to play.
  //
  // Switching reciter mid-surah changes the voice from the NEXT ayah, not this
  // one: the hook reads reciterId when it starts an ayah, and the one already
  // sounding keeps its source (device check 87).
  const audio = useRecitation(surahId, reader?.data.surah.ayah_count ?? 0, reciterId, {
    surahName: reader?.data.surah.name_translit,
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
    if (!displayedSurahId) return null;
    return createLatestReadingPositionRecorder(async (ayahNumber) => {
      setReadingError(null);
      const userDb = await openUserDb();
      const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
      await recordReadingPosition(userClient, displayedSurahId, ayahNumber);
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
  }, [displayedSurahId, uiLocale]);

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
          setReader({ surahId, data });
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

  // useCallback, not an inline closure: this prop is in the dependency array of
  // the effect that publishes the header (SurahReader), and this component
  // re-renders on every playback tick. A fresh closure per render rebuilt the
  // whole header and dispatched setOptions into the navigator several times a
  // second while audio played.
  const onPageSurah = useCallback(
    (target: number, side: 'prev' | 'next') => pager.goTo(String(target), side),
    [pager.goTo],
  );

  const loadWords = useCallback(
    async (ayahId: number) => {
      if (!corpusClient) return [];
      return getWordsForAyah(corpusClient, ayahId);
    },
    [corpusClient],
  );

  async function toggleBookmark(ayahNumber: number) {
    if (!displayedSurahId) return;
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
      await setBookmark(userClient, displayedSurahId, ayahNumber, nextBookmarked);
    } catch (cause) {
      console.error('[reader] bookmark write failed', { surahId: displayedSurahId, ayahNumber, cause });
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

  // Only while there is nothing to hold -- the first load of the screen. A
  // page turn keeps the outgoing surah up, which is what reanimated slides out.
  if (loading && !held) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !held) {
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
      <Animated.View
        // Keyed by surah so reanimated sees one view leave as another arrives;
        // without the key React would reconcile them into a single view and
        // there would be nothing to animate.
        key={displayedSurahId}
        entering={pager.animation.entering}
        exiting={pager.animation.exiting}
        style={{ flex: 1 }}
      >
      <SurahReader
        data={held}
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
        // 1 and 114 are facts about the mushaf, and parseSurahId enforces the
        // same bound on the route. D47: no wrapping, so an end is a dead arrow
        // rather than a jump to the other end of the book.
        prevSurahId={surahId !== null && surahId > 1 ? surahId - 1 : null}
        nextSurahId={surahId !== null && surahId < 114 ? surahId + 1 : null}
        onPageSurah={onPageSurah}
      />
      </Animated.View>
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
