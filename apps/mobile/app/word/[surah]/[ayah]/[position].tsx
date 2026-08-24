import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { SegmentedWord } from '@/components/SegmentedWord';
import { SegmentPill } from '@/components/SegmentPill';
import { getWordAtLocation, type WordSummary } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { parseAyahNumber, parsePosition, parseSurahId } from '@/data/routeParams';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

/** The full morphological analysis of one word, reached from the reader sheet's
 *  "Full analysis" link or from a deep link. */
export default function WordDetailRoute() {
  const params = useLocalSearchParams<{ surah: string; ayah: string; position: string }>();
  const surahId = useMemo(() => parseSurahId(params.surah), [params.surah]);
  const ayahNumber = useMemo(() => parseAyahNumber(params.ayah), [params.ayah]);
  const position = useMemo(() => parsePosition(params.position), [params.position]);
  const { contentLanguage, uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
  const sizes = useArabicSizes();
  const [summary, setSummary] = useState<WordSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadWord() {
      // Before any query, not inside it: these three are strings off a URL, and
      // an unbounded one has no business reaching the database at all.
      if (!surahId || !ayahNumber || !position) {
        setSummary(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getWordAtLocation(client, surahId, ayahNumber, position, contentLanguage);
        if (!cancelled) setSummary(found);
      } catch (cause) {
        // Same not-found state as a missing row: there is nothing the reader
        // can do about either, and two indistinguishable dead ends do not need
        // two screens. Logged for logcat.
        console.error('[word] load failed', { surahId, ayahNumber, position, cause });
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadWord();
    return () => {
      cancelled = true;
    };
  }, [ayahNumber, contentLanguage, position, surahId]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
        <Text accessibilityRole="alert" style={{ color: theme.mutedText, fontSize: typography.body }}>
          {t(uiLocale, 'word.notFound')}
        </Text>
      </View>
    );
  }

  const { word, segments, gloss } = summary;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, gap: 18, paddingBottom }}
    >
      <Text accessibilityRole="header" style={{ color: theme.mutedText, fontSize: typography.caption }}>
        {`${t(uiLocale, 'reader.ayahLabel')} ${surahId}:${ayahNumber} · ${position}`}
      </Text>
      <SegmentedWord word={word} segments={segments} fontSize={sizes.title} />
      {word.transliteration ? (
        // Labelled rather than captioned: a caption between the Arabic and its
        // transliteration breaks the pairing visually, but unlabelled the line
        // reaches TalkBack as a bare string with nothing saying what it is.
        <Text
          accessibilityLabel={`${t(uiLocale, 'word.transliteration')}: ${word.transliteration}`}
          style={{ color: theme.mutedText, fontSize: typography.body }}
        >
          {word.transliteration}
        </Text>
      ) : null}
      <Text style={{ color: gloss ? theme.text : theme.mutedText, fontSize: typography.body }}>
        {gloss ?? t(uiLocale, 'word.noGloss')}
      </Text>

      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
          {t(uiLocale, 'word.segments')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {segments.map((segment) => (
            <SegmentPill key={segment.id} segment={segment} />
          ))}
        </View>
      </View>

      {/* grammar_note, never grammar_arabic: the corpus's grammar_arabic column
          is mangled, and shipping it is the exact bug PRs #44 and #45 fixed on
          web. */}
      {word.grammar_note ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {t(uiLocale, 'word.grammar')}
          </Text>
          <Text style={{ color: theme.text, fontSize: typography.body }}>{word.grammar_note}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
