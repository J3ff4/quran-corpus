import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { EMPTY_SEARCH_RESULT, type SearchResult } from '@quran-corpus/data/mobile';
import { searchCorpus } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { SnippetText } from '@/components/SnippetText';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

// Long enough that a fast typist runs one query rather than six, short enough
// that results still feel attached to the keystroke. The DB is local, so this
// is about wasted work, not latency.
export const DEBOUNCE_MS = 200;

// How long a query may run before it is allowed to show a spinner. The DB is
// local, so a query that beats this never flashes an indicator at all -- which
// is the whole point: at 200ms debounce + an instant result, the old
// unconditional spinner was a dot that appeared and vanished on every
// keystroke.
export const SPINNER_DELAY_MS = 300;

export function SearchScreen() {
  const { uiLocale, contentLanguage } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();

  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult>(EMPTY_SEARCH_RESULT);
  // The query text `result` actually came back for, or null when nothing has
  // completed yet. "Nothing found" is a verdict on a finished query, so it
  // renders off this and never off the text currently in the box -- otherwise
  // every keystroke paints it during the debounce, before any query has run.
  const [settled, setSettled] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  // Every keystroke starts a query and they can land out of order; only the
  // newest is allowed to write state.
  const requestRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      // Bump the sequence too: an in-flight debounced request from the text
      // just cleared would otherwise still pass its own `requestRef.current
      // !== request` check and repaint stale hits underneath the empty state.
      requestRef.current += 1;
      setResult(EMPTY_SEARCH_RESULT);
      setFailed(false);
      // Back to "nothing has completed": re-typing the text just cleared must
      // run a fresh query rather than inheriting the old verdict.
      setSettled(null);
      // The bump above makes any in-flight request non-current, so its own
      // `finally` will no longer clear this -- the spinner would sit forever
      // beside the "type something" hint.
      setSlow(false);
      return;
    }

    const request = (requestRef.current += 1);
    const timer = setTimeout(async () => {
      const spinner = setTimeout(() => {
        if (requestRef.current === request) setSlow(true);
      }, SPINNER_DELAY_MS);
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await searchCorpus(client, trimmed, contentLanguage);
        if (requestRef.current !== request) return;
        setResult(found);
        setFailed(false);
        setSettled(trimmed);
      } catch (cause) {
        // Distinct from "nothing found": an FTS5 build problem and an
        // unmatched word are otherwise the same blank screen. Query text is
        // deliberately not logged here -- it would put search terms in
        // release-build logs.
        console.error('[search] failed', cause);
        if (requestRef.current !== request) return;
        setResult(EMPTY_SEARCH_RESULT);
        setFailed(true);
      } finally {
        clearTimeout(spinner);
        if (requestRef.current === request) setSlow(false);
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
  // Reads the last *completed* query, not the box: while the user keeps
  // typing, the previous verdict and the previous hits both stay put instead
  // of blinking out and back.
  const nothing =
    !empty &&
    settled !== null &&
    !failed &&
    result.jump === null &&
    result.verses.length === 0 &&
    result.roots.length === 0;

  return (
    <View style={{ flex: 1 }}>
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom }}
        // Otherwise Android's default ("never") reads the first tap on a
        // result -- with the autofocused input still holding the keyboard
        // open -- as "dismiss the keyboard", not as a press on that row.
        keyboardShouldPersistTaps="handled"
      >
        {slow ? <ActivityIndicator testID="search-loading" /> : null}
        {failed ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
            {t(uiLocale, 'search.loadFailed')}
          </Text>
        ) : null}
        {empty ? <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'search.empty')}</Text> : null}
        {nothing ? <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'search.noResults')}</Text> : null}

        {result.jump ? (
          <>
            <Text accessibilityRole="header" style={heading}>{t(uiLocale, 'search.jump').toUpperCase()}</Text>
            <Pressable
              testID="search-jump"
              accessibilityRole="button"
              onPress={openJump}
              style={{ paddingVertical: 14, minHeight: touchTargets.minimum }}
            >
              <Text style={{ color: theme.accent, fontSize: 17 }}>
                {/* A surah-name-only reference ("Al-Baqarah") has no ayah at
                    all -- openJump pushes the surah with no `?ayah=`, so
                    faking one here (the old `?? 1`) labelled a destination
                    the tap would not actually land on. */}
                {result.jump.ayah_number === null
                  ? result.jump.surah_id
                  : `${result.jump.surah_id}:${result.jump.ayah_number}`}
              </Text>
            </Pressable>
          </>
        ) : null}

        {result.verses.length > 0 ? (
          <>
            <Text accessibilityRole="header" style={heading}>{t(uiLocale, 'search.verses').toUpperCase()}</Text>
            {result.verses.map((hit) => (
              <Pressable
                key={`${hit.source}-${hit.surah_id}-${hit.ayah_number}`}
                testID="search-verse"
                accessibilityRole="button"
                onPress={() => router.push(`/surah/${hit.surah_id}?ayah=${hit.ayah_number}`)}
                style={{ paddingVertical: 12, minHeight: touchTargets.minimum }}
              >
                <Text style={{ color: theme.mutedText, fontSize: 12 }}>
                  {hit.surah_id}:{hit.ayah_number}
                </Text>
                <SnippetText
                  snippet={hit.snippet}
                  highlightColor={theme.accent}
                  // Hafs only for the Arabic body -- a Russian or Uzbek
                  // snippet has no business in the Uthmani face, and
                  // `hit.source` is exactly what says which this is.
                  style={hit.source === 'ar' ? { color: theme.text, fontFamily: 'Hafs' } : { color: theme.text }}
                />
              </Pressable>
            ))}
          </>
        ) : null}

        {result.roots.length > 0 ? (
          <>
            <Text accessibilityRole="header" style={heading}>{t(uiLocale, 'search.roots').toUpperCase()}</Text>
            {result.roots.map((root) => (
              <Pressable
                key={root.root_buckwalter}
                testID="search-root"
                accessibilityRole="button"
                onPress={() => router.push(`/root/${encodeURIComponent(root.root_buckwalter)}`)}
                style={{ paddingVertical: 12, minHeight: touchTargets.minimum }}
              >
                <Text style={{ color: theme.accent, fontSize: 17, fontFamily: 'Hafs' }}>{root.root_arabic}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
