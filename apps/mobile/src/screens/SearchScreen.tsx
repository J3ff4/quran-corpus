import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { router } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { EMPTY_SEARCH_RESULT, type SearchResult } from '@quran-corpus/data/mobile';
import { GlassSurface } from '@/components/GlassSurface';
import { SnippetText } from '@/components/SnippetText';
import { searchCorpus } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { usePressScale } from '@/motion/usePressScale';
import { useAppSettings } from '@/settings/settingsStore';
import { fonts, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** One result row, whatever kind it is: a glass card that squeezes on press.
 *
 *  The three kinds differ in what they put inside it (mockup 1i), not in how
 *  they are pressed -- and three copies of a Pressable is how one of them
 *  gains a press affordance the other two miss.
 *
 *  `tinted` is the jump: an exact verse reference is the one result the reader
 *  asked for by name, so it takes the accent wash rather than plain glass. The
 *  wash's measured contrast assumes it sits directly on the page, so it
 *  replaces the glass fill instead of layering over it. */
function ResultCard({
  testID,
  accessibilityLabel,
  onPress,
  tinted = false,
  children,
}: {
  testID: string;
  accessibilityLabel?: string;
  onPress: () => void;
  tinted?: boolean;
  children: React.ReactNode;
}) {
  const theme = useThemeColors();
  const press = usePressScale();

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[press.style, { marginBottom: 9 }]}
    >
      <GlassSurface
        style={{
          shadowOpacity: 0,
          elevation: 0,
          minHeight: touchTargets.minimum,
          paddingHorizontal: 18,
          paddingVertical: 14,
          gap: 9,
          ...(tinted
            ? { backgroundColor: theme.accentWash, borderColor: theme.accent }
            : null),
        }}
      >
        {children}
      </GlassSurface>
    </AnimatedPressable>
  );
}

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

  const heading = {
    color: theme.mutedText,
    fontFamily: fonts.displaySemiBold,
    fontSize: typography.caption,
    letterSpacing: 1.2,
    marginTop: 20,
    marginBottom: 9,
  } as const;
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
        {/* Glass, and accent-bordered rather than hairline-bordered: the field
            is autofocused, so it is always the focused control on this screen
            and drawing it as one is honest (mockup 1i). */}
        <GlassSurface style={{ borderColor: theme.accent, paddingHorizontal: 4 }}>
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
              paddingHorizontal: 14,
              minHeight: touchTargets.minimum,
            }}
          />
        </GlassSurface>
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
            <ResultCard testID="search-jump" onPress={openJump} tinted>
              <Text
                style={{
                  color: theme.accent,
                  fontSize: 20,
                  fontWeight: '700',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {/* A surah-name-only reference ("Al-Baqarah") has no ayah at
                    all -- openJump pushes the surah with no `?ayah=`, so
                    faking one here (the old `?? 1`) labelled a destination
                    the tap would not actually land on. */}
                {result.jump.ayah_number === null
                  ? result.jump.surah_id
                  : `${result.jump.surah_id}:${result.jump.ayah_number}`}
              </Text>
            </ResultCard>
          </>
        ) : null}

        {result.verses.length > 0 ? (
          <>
            <Text accessibilityRole="header" style={heading}>{t(uiLocale, 'search.verses').toUpperCase()}</Text>
            {result.verses.map((hit) => (
              <ResultCard
                key={`${hit.source}-${hit.surah_id}-${hit.ayah_number}`}
                testID="search-verse"
                onPress={() => router.push(`/surah/${hit.surah_id}?ayah=${hit.ayah_number}`)}
              >
                <Text
                  style={{
                    color: theme.accent,
                    fontSize: typography.caption,
                    fontWeight: '600',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {hit.surah_id}:{hit.ayah_number}
                </Text>
                <SnippetText
                  snippet={hit.snippet}
                  highlightColor={theme.accent}
                  highlightBackground={theme.accentWash}
                  // Hafs only for the Arabic body -- a Russian or Uzbek
                  // snippet has no business in the Uthmani face, and
                  // `hit.source` is exactly what says which this is.
                  style={
                    hit.source === 'ar'
                      ? { color: theme.text, fontFamily: fonts.arabic, fontSize: 22, writingDirection: 'rtl' }
                      : { color: theme.text, fontSize: typography.body }
                  }
                />
              </ResultCard>
            ))}
          </>
        ) : null}

        {result.roots.length > 0 ? (
          <>
            <Text accessibilityRole="header" style={heading}>{t(uiLocale, 'search.roots').toUpperCase()}</Text>
            {result.roots.map((root) => (
              <ResultCard
                key={root.root_buckwalter}
                testID="search-root"
                // The card is one accessibility node, so without this it
                // announces as the bare concatenation of a root and a number,
                // with nothing to say what the number counts.
                accessibilityLabel={`${root.root_arabic}, ${root.occurrence_count} ${t(uiLocale, 'dictionary.occurrences')}`}
                onPress={() => router.push(`/root/${encodeURIComponent(root.root_buckwalter)}`)}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  {/* Letter-spaced, as 1i draws it: a root is three
                      consonants, not a word, and spacing them says so without
                      a second line of explanation. */}
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 26,
                      fontFamily: fonts.arabic,
                      letterSpacing: 4,
                      writingDirection: 'rtl',
                    }}
                  >
                    {root.root_arabic}
                  </Text>
                  <Text
                    style={{
                      color: theme.mutedText,
                      fontSize: typography.caption,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {root.occurrence_count}
                  </Text>
                </View>
              </ResultCard>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
