import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import type { SearchResult } from '@quran-corpus/data/mobile';
import { searchCorpus } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { SnippetText } from '@/components/SnippetText';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const EMPTY: SearchResult = { jump: null, verses: [], roots: [] };
// Long enough that a fast typist runs one query rather than six, short enough
// that results still feel attached to the keystroke. The DB is local, so this
// is about wasted work, not latency.
const DEBOUNCE_MS = 200;

export function SearchScreen() {
  const { uiLocale, contentLanguage } = useAppSettings();
  const theme = useThemeColors();

  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Every keystroke starts a query and they can land out of order; only the
  // newest is allowed to write state.
  const requestRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResult(EMPTY);
      setFailed(false);
      return;
    }

    const request = (requestRef.current += 1);
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await searchCorpus(client, trimmed, contentLanguage);
        if (requestRef.current !== request) return;
        setResult(found);
        setFailed(false);
      } catch (cause) {
        // Distinct from "nothing found": an FTS5 build problem and an
        // unmatched word are otherwise the same blank screen.
        console.error('[search] failed', { query: trimmed, cause });
        if (requestRef.current !== request) return;
        setResult(EMPTY);
        setFailed(true);
      } finally {
        if (requestRef.current === request) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, contentLanguage]);

  const openJump = useCallback(() => {
    const jump = result.jump;
    if (!jump) return;
    const suffix = jump.ayah_number === null ? '' : `?ayah=${jump.ayah_number}`;
    router.push(`/surah/${jump.surah_id}${suffix}`);
  }, [result.jump]);

  const heading = { color: theme.mutedText, fontSize: 12, letterSpacing: 1, marginTop: 20 };
  const empty = query.trim().length === 0;
  const nothing =
    !empty &&
    !loading &&
    !failed &&
    result.jump === null &&
    result.verses.length === 0 &&
    result.roots.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16 }}>
        <TextInput
          testID="search-input"
          value={query}
          onChangeText={setQuery}
          placeholder={t(uiLocale, 'search.placeholder')}
          placeholderTextColor={theme.mutedText}
          autoFocus
          accessibilityLabel={t(uiLocale, 'search.title')}
          style={{
            color: theme.text,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            minHeight: touchTargets.minimum,
          }}
        />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {loading ? <ActivityIndicator /> : null}
        {failed ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
            {t(uiLocale, 'search.loadFailed')}
          </Text>
        ) : null}
        {empty ? <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'search.empty')}</Text> : null}
        {nothing ? <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'search.noResults')}</Text> : null}

        {result.jump ? (
          <>
            <Text style={heading}>{t(uiLocale, 'search.jump').toUpperCase()}</Text>
            <Pressable
              testID="search-jump"
              accessibilityRole="button"
              onPress={openJump}
              style={{ paddingVertical: 14, minHeight: touchTargets.minimum }}
            >
              <Text style={{ color: theme.accent, fontSize: 17 }}>
                {result.jump.surah_id}:{result.jump.ayah_number ?? 1}
              </Text>
            </Pressable>
          </>
        ) : null}

        {result.verses.length > 0 ? (
          <>
            <Text style={heading}>{t(uiLocale, 'search.verses').toUpperCase()}</Text>
            {result.verses.map((hit) => (
              <Pressable
                key={`${hit.source}-${hit.surah_id}-${hit.ayah_number}`}
                testID="search-verse"
                accessibilityRole="button"
                onPress={() => router.push(`/surah/${hit.surah_id}?ayah=${hit.ayah_number}`)}
                style={{ paddingVertical: 12 }}
              >
                <Text style={{ color: theme.mutedText, fontSize: 12 }}>
                  {hit.surah_id}:{hit.ayah_number}
                </Text>
                <SnippetText snippet={hit.snippet} highlightColor={theme.accent} style={{ color: theme.text }} />
              </Pressable>
            ))}
          </>
        ) : null}

        {result.roots.length > 0 ? (
          <>
            <Text style={heading}>{t(uiLocale, 'search.roots').toUpperCase()}</Text>
            {result.roots.map((root) => (
              <Pressable
                key={root.root_buckwalter}
                testID="search-root"
                accessibilityRole="button"
                onPress={() => router.push(`/root/${encodeURIComponent(root.root_buckwalter)}`)}
                style={{ paddingVertical: 12, minHeight: touchTargets.minimum }}
              >
                <Text style={{ color: theme.accent, fontSize: 17 }}>{root.root_arabic}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
