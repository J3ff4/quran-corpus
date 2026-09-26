import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { router, useNavigation } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { EMPTY_SEARCH_RESULT, type SearchResult } from '@quran-corpus/data/mobile';
import { RiseIn } from '@/components/RiseIn';
import { GlassSurface } from '@/components/GlassSurface';
import { Icon } from '@/components/icons/Icon';
import { SearchField } from '@/components/SearchField';
import { SurahJumpSheet } from '@/components/SurahJumpSheet';
import { SurahPicker } from '@/components/SurahPicker';
import { SnippetText } from '@/components/SnippetText';
import { searchCorpus } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { contentLanguages, type QueryLanguageCode } from '@/i18n/languages';
import { useHeldEntry } from '@/motion/entryPager';
import { usePressScale } from '@/motion/usePressScale';
import { getReaderSurah } from '@/data/readerPosition';
import { useSurahIndex } from '@/data/useSurahIndex';
import { useAppSettings } from '@/settings/settingsStore';
import { fonts, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The native name of a hit's language, or null when the hit needs no label:
 *  the Arabic body (its face already says so) and the reader's own language
 *  (which is what an unlabelled row means). `uz-Cyrl` labels as Uzbek -- it is
 *  the same language in the other alphabet, and the snippet shows which. */
function crossLanguageLabel(source: string, reader: QueryLanguageCode): string | null {
  if (source === 'ar' || source === reader) return null;
  const code = source === 'uz-Cyrl' ? 'uz' : source;
  return contentLanguages.find((l) => l.code === code)?.nativeLabel ?? null;
}

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
        // Through `tint` rather than a backgroundColor in `style`: both reach
        // the same declaration, and one of the two is the surface's documented
        // way of saying "paint this instead of the glass fill".
        tint={tinted ? theme.accentWash : undefined}
        style={{
          shadowOpacity: 0,
          elevation: 0,
          minHeight: touchTargets.minimum,
          paddingHorizontal: 18,
          paddingVertical: 14,
          gap: 9,
          ...(tinted ? { borderColor: theme.accent } : null),
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
  const { uiLocale, queryLanguage, nameLanguage } = useAppSettings();
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
        const found = await searchCorpus(client, trimmed, queryLanguage);
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
  }, [query, queryLanguage]);

  // The jump card already resolves a typed surah NAME -- search.ts has folded
  // names since 1aca65a -- but it labelled the destination with a bare number,
  // so a reader who searched "baqara" was answered with "2" and no sign that
  // the name had been understood. The index is 114 rows the app reads anyway.
  const { surahs, ayahCountOf } = useSurahIndex(nameLanguage);
  // One state, not two booleans: two would let the jump sheet and the picker
  // be open at once, which is the whole failure mode of a sheet that opens
  // another sheet. Same shape as the reader's and WbwScreen's.
  const [jumpView, setJumpView] = useState<'jump' | 'picker' | null>(null);
  // Held across the close, not read live. The GO TO section is a curtain now,
  // and a curtain's children stay mounted until the close lands -- reading
  // `result.jump` there would blank the card on the first frame of the very
  // animation that exists to stop it blinking out.
  const jump = useHeldEntry(result.jump);

  // Off the held reference too, for the same reason: the name dropping out
  // mid-close is the card rearranging itself while it leaves.
  const jumpSurahName =
    jump === null
      ? null
      : (surahs?.find((surah) => surah.id === jump.surah_id)?.nameTranslit ?? null);

  // Both sheets land here: the jump sheet's Go, and a name picked out of the
  // browser. Closing before the push, so a back into this screen does not find
  // a sheet still standing over it.
  const openSurah = useCallback((surahId: number, ayahNumber: number) => {
    setJumpView(null);
    router.push(`/surah/${surahId}?ayah=${ayahNumber}`);
  }, []);

  // In the header strip beside the back arrow, not under the field (owner,
  // 2026-09-24): this screen's header carries nothing but the back
  // affordance, and the row it used to sit on pushed the results down for a
  // control that is not part of the search.
  //
  // setOptions publishes into a real header here -- search is a Stack screen
  // with the navigator's own header, not a tab (SearchHeaderButton's docstring
  // is about the tab case, where it publishes into nothing).
  const navigation = useNavigation();
  const headerRight = useCallback(
    () => (
      <Pressable
        testID="search-goto"
        accessibilityRole="button"
        // Spoken long, drawn short: "Go to" alone gives TalkBack nothing to go
        // on. Same split as the reader's surah name.
        accessibilityLabel={t(uiLocale, 'jump.surahTitle')}
        onPress={() => setJumpView('jump')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minHeight: touchTargets.minimum,
          paddingHorizontal: 4,
        }}
      >
        <Icon name="book" color={theme.accent} size={18} />
        <Text style={{ color: theme.accent, fontSize: typography.body }}>
          {t(uiLocale, 'jump.title')}
        </Text>
      </Pressable>
    ),
    [uiLocale, theme.accent],
  );
  useEffect(() => {
    navigation.setOptions({ headerRight });
  }, [navigation, headerRight]);

  const openJump = useCallback(() => {
    // The live one, not the held one: the card is still on screen through the
    // close, and a press landing on it then must not push the reference the
    // query has already moved off.
    const target = result.jump;
    if (!target) return;
    const suffix = target.ayah_number === null ? '' : `?ayah=${target.ayah_number}`;
    router.push(`/surah/${target.surah_id}${suffix}`);
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
        <SearchField
          testID="search-input"
          clearTestID="search-input-clear"
          value={query}
          onChangeText={setQuery}
          placeholder={t(uiLocale, 'search.placeholder')}
          accessibilityLabel={t(uiLocale, 'search.title')}
          clearAccessibilityLabel={t(uiLocale, 'search.clearSearch')}
          autoFocus
        />
      </View>

      {jumpView === 'jump' ? (
        <SurahJumpSheet
          uiLocale={uiLocale}
          // Where the reader was left, not al-Fatihah: a sheet that always
          // opened at 1 would make the reader's own position invisible.
          surahId={getReaderSurah() ?? 1}
          ayahCountOf={ayahCountOf}
          onClose={() => setJumpView(null)}
          onJump={openSurah}
          // No rows, no row: the picker has nothing to show until the index
          // read lands. The reader and morphology have had this row since
          // M12; this screen opens the same sheet and was the one entry point
          // without it (owner, 2026-09-24).
          onBrowse={surahs === null ? undefined : () => setJumpView('picker')}
        />
      ) : null}
      {jumpView === 'picker' && surahs !== null ? (
        <SurahPicker
          surahs={surahs}
          uiLocale={uiLocale}
          // Ruling R3: a name goes to the head of its surah.
          onPick={(surahId) => openSurah(surahId, 1)}
          onClose={() => setJumpView(null)}
        />
      ) : null}

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

        {/* It rises into place, the way the reader's word sheet does (owner,
            2026-09-23). This was a Collapsible for a day: animating the clip's
            height carried the rows below along with the card, which stopped
            them snapping but made the whole list breathe in and out while the
            reference was still being typed. The owner watched both on the
            device and ruled for the sheet's motion -- the card arrives, the
            rows below simply take their places. */}
        <RiseIn open={result.jump !== null} testID="search-jump-rise">
          {jump === null ? null : (
            <>
              <ResultCard testID="search-jump" onPress={openJump} tinted>
                <Text
                  testID="search-jump-ref"
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
                  {jump.ayah_number === null
                    ? jump.surah_id
                    : `${jump.surah_id}:${jump.ayah_number}`}
                </Text>
                {jumpSurahName === null ? null : (
                  <Text testID="search-jump-name" style={{ color: theme.mutedText, fontSize: typography.caption }}>
                    {jumpSurahName}
                  </Text>
                )}
              </ResultCard>
            </>
          )}
        </RiseIn>

        {result.verses.length > 0 ? (
          <>
            <Text accessibilityRole="header" style={heading}>{t(uiLocale, 'search.verses').toUpperCase()}</Text>
            {result.verses.map((hit) => (
              <ResultCard
                key={`${hit.source}-${hit.surah_id}-${hit.ayah_number}`}
                testID="search-verse"
                onPress={() => router.push(`/surah/${hit.surah_id}?ayah=${hit.ayah_number}`)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                  {/* Search now follows the query's script rather than the
                      reader's language, so a Cyrillic query answers with
                      Russian verses while the reader sits on English. Those
                      hits need to say what they are -- unlabelled, a Russian
                      snippet under an English list reads as a bug. */}
                  {crossLanguageLabel(hit.source, queryLanguage) ? (
                    <Text
                      testID="search-verse-language"
                      style={{
                        color: theme.mutedText,
                        fontSize: typography.caption,
                        fontWeight: '600',
                      }}
                    >
                      {crossLanguageLabel(hit.source, queryLanguage)}
                    </Text>
                  ) : null}
                </View>
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
