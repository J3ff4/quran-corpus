import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { useAyahAudioController } from '@/audio/ayahAudio';
import { LanguageSelector } from '@/components/LanguageSelector';
import { SurahReader } from '@/components/SurahReader';
import { getSurahReader, type SurahReaderData } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { openUserDb } from '@/data/userDb';
import { getBookmarks, recordReadingPosition, setBookmark } from '@/data/userRepository';
import { useAppSettings } from '@/settings/settingsStore';
import { colors } from '@/theme/tokens';

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
  const { contentLanguage, setContentLanguage } = useAppSettings();
  const audio = useAyahAudioController(process.env.EXPO_PUBLIC_AUDIO_API_BASE_URL, surahId);
  const [reader, setReader] = useState<SurahReaderData | null>(null);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      try {
        const [corpusDb, userDb] = await Promise.all([openCorpusDb(), openUserDb()]);
        const corpusClient = createExpoSqliteClient(corpusDb as ExpoSqliteLike);
        const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
        const [data, savedBookmarks] = await Promise.all([
          getSurahReader(corpusClient, surahId, contentLanguage),
          getBookmarks(userClient),
        ]);

        if (data.ayahs[0]) {
          await recordReadingPosition(userClient, surahId, data.ayahs[0].ayah.ayah_number);
        }

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
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load surah');
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
    setBookmarks((current) => {
      const next = new Set(current);
      if (nextBookmarked) next.add(ayahNumber);
      else next.delete(ayahNumber);
      return next;
    });

    const userDb = await openUserDb();
    const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
    await setBookmark(userClient, surahId, ayahNumber, nextBookmarked);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !reader) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: colors.paper }}>
        <Text style={{ color: colors.danger }}>{error ?? 'Unable to load surah'}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <LanguageSelector value={contentLanguage} onChange={setContentLanguage} />
      <SurahReader
        data={reader}
        bookmarkedAyahs={bookmarks}
        playingAyah={audio.playingAyah}
        audioEnabled={audio.audioEnabled}
        onToggleBookmark={toggleBookmark}
        onToggleAudio={audio.toggleAyah}
      />
      {audio.audioError ? <Text style={{ color: colors.danger, padding: 20 }}>{audio.audioError}</Text> : null}
    </View>
  );
}
