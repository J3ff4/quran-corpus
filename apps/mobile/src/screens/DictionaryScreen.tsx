import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import {
  compareRootsArabic,
  foldRootArabic,
  rootFirstLetter,
  type RootSearchItem,
} from '@quran-corpus/data/mobile';
import { AlphabetGrid } from '@/components/AlphabetGrid';
import { DictionaryRow } from '@/components/DictionaryRow';
import { FrequencyList } from '@/components/FrequencyList';
import { SearchHeaderButton } from '@/components/SearchHeaderButton';
import { getAllRootsForBrowse, getLettersWithRoots } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

type Pane = 'browse' | 'frequent';
type DictionarySort = 'alpha' | 'freq';

/** Stable identity: `available ?? new Set()` would hand AlphabetGrid a fresh
 *  set on every render. */
const NO_LETTERS: ReadonlySet<string> = new Set();
const NO_ROOTS: RootSearchItem[] = [];

export function DictionaryScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const navigation = useNavigation();
  const [pane, setPane] = useState<Pane>('browse');
  const [kind, setKind] = useState<'roots' | 'lemmas' | 'verbs'>('roots');
  // null while loading. The grid renders every cell disabled until this
  // arrives, rather than flashing an all-enabled alphabet that then dims.
  const [available, setAvailable] = useState<ReadonlySet<string> | null>(null);
  // null while loading; a bare TextInput/list must not read as "no roots" for
  // the tick before the query settles.
  const [roots, setRoots] = useState<RootSearchItem[] | null>(null);
  const [rootsFailed, setRootsFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DictionarySort>('alpha');
  const [letter, setLetter] = useState<string | null>(null);

  // Which letters have roots at all. The fold lives in the repository, next to
  // the getAllRootsForBrowse list that Browse's own letter filter has to agree
  // with.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const letters = await getLettersWithRoots(client);
        if (!cancelled) setAvailable(letters);
      } catch (cause) {
        // Empty set, so every cell stays disabled. Safe in the sense that
        // matters here: a dead grid is inert, whereas enabling all 29 cells
        // filters to a letter that then comes up empty.
        console.error('[dictionary] letter availability failed', cause);
        if (!cancelled) setAvailable(NO_LETTERS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Browse's whole payload, fetched once: search/sort/letter all run over
  // this in JS afterwards (the `visible` memo below), the same split web's
  // static-payload DictionaryBrowser uses.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getAllRootsForBrowse(client);
        if (!cancelled) setRoots(found);
      } catch (cause) {
        console.error('[dictionary] browse load failed', cause);
        if (!cancelled) {
          setRoots(NO_ROOTS);
          setRootsFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The third of the spec's three search entry points; the reader's and Home's
  // landed in Task 3.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <SearchHeaderButton uiLocale={uiLocale} onPress={() => router.push('/search')} />
      ),
    });
  }, [navigation, uiLocale]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = roots ?? NO_ROOTS;
    if (letter) list = list.filter((root) => rootFirstLetter(root.root_arabic) === letter);
    if (q) {
      // The Arabic arm folds both sides (hamza seat + inter-letter spaces) so
      // `ارض` finds the stored `أرض` -- the same normalization searchRoots
      // uses. The Latin arms stay raw: foldRootArabic('ktb') === 'ktb', and a
      // folded Latin needle never occurs inside an Arabic haystack.
      const qf = foldRootArabic(q);
      list = list.filter(
        (root) =>
          foldRootArabic(root.root_arabic).includes(qf) ||
          root.root_buckwalter.toLowerCase().includes(q) ||
          (root.gloss_blob?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) =>
      sort === 'freq'
        ? b.occurrence_count - a.occurrence_count ||
          compareRootsArabic(a.root_arabic, b.root_arabic)
        : compareRootsArabic(a.root_arabic, b.root_arabic),
    );
  }, [roots, query, sort, letter]);

  function setSortAndClearLetter(next: DictionarySort) {
    // Matches web: switching sort clears the letter, so the list the reader
    // sees is the whole corpus ordered by frequency, not one letter of it.
    setSort(next);
    setLetter(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: 'row', padding: 16, gap: 8 }}>
        {(['browse', 'frequent'] as const).map((option) => (
          <Pressable
            key={option}
            testID={`dictionary-pane-${option}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: pane === option }}
            onPress={() => setPane(option)}
            style={{
              flex: 1,
              minHeight: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: pane === option ? theme.accent : 'transparent',
            }}
          >
            <Text style={{ color: pane === option ? theme.onAccent : theme.text }}>
              {t(uiLocale, option === 'browse' ? 'dictionary.browse' : 'dictionary.frequent')}
            </Text>
          </Pressable>
        ))}
      </View>

      {pane === 'browse' ? (
        <>
          {/* A TextInput inside a FlatList's ListHeaderComponent loses focus on
              every keystroke -- the header element is a new instance each
              render, so the input remounts. This has to be a sibling of the
              list, not inside it. */}
          <View style={{ paddingHorizontal: 16 }}>
            <TextInput
              testID="dictionary-search"
              value={query}
              onChangeText={setQuery}
              placeholder={t(uiLocale, 'dictionary.searchPlaceholder')}
              placeholderTextColor={theme.mutedText}
              accessibilityLabel={t(uiLocale, 'dictionary.searchLabel')}
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

          {rootsFailed ? (
            <View style={{ padding: 20 }}>
              <Text accessibilityRole="alert" style={{ color: theme.mutedText, fontSize: typography.body }}>
                {t(uiLocale, 'dictionary.loadFailed')}
              </Text>
            </View>
          ) : (
            <FlatList
              testID="dictionary-list"
              data={visible}
              keyExtractor={(item) => item.root_buckwalter}
              // Otherwise Android's default ("never") reads the first tap on a
              // row -- with the keyboard open from the search box above -- as
              // "dismiss the keyboard" rather than as a press on that row.
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <>
                  <AlphabetGrid
                    uiLocale={uiLocale}
                    available={available ?? NO_LETTERS}
                    activeLetter={letter}
                    onSelect={(picked) => setLetter((prev) => (prev === picked ? null : picked))}
                  />
                  <View
                    accessibilityRole="toolbar"
                    accessibilityLabel={t(uiLocale, 'dictionary.sortFilter')}
                    style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}
                  >
                    {(['alpha', 'freq'] as const).map((option) => (
                      <Pressable
                        key={option}
                        testID={`dictionary-sort-${option}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sort === option }}
                        onPress={() => setSortAndClearLetter(option)}
                        style={{
                          paddingHorizontal: 14,
                          minHeight: touchTargets.minimum,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: sort === option ? theme.accent : theme.border,
                        }}
                      >
                        <Text style={{ color: sort === option ? theme.accent : theme.mutedText }}>
                          {t(uiLocale, option === 'alpha' ? 'dictionary.sortAlpha' : 'dictionary.sortFreq')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              }
              ListEmptyComponent={
                <View style={{ padding: 20 }}>
                  <Text testID="dictionary-empty" style={{ color: theme.mutedText }}>
                    {t(uiLocale, 'dictionary.noRootsFound')}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <DictionaryRow
                  uiLocale={uiLocale}
                  arabic={item.root_arabic}
                  count={item.occurrence_count}
                  href={`/root/${encodeURIComponent(item.root_buckwalter)}`}
                />
              )}
              style={{ flex: 1 }}
            />
          )}
        </>
      ) : null}
      {pane === 'frequent' ? (
        <>
          <View
            // Three sibling chips with nothing saying they filter the list
            // below, the same gap AlphabetGrid names its container for.
            // toolbar, not radiogroup: the chips are Material filter chips --
            // buttons carrying a selected state, per Android convention -- and
            // radiogroup would claim radio children they deliberately are not.
            accessibilityRole="toolbar"
            accessibilityLabel={t(uiLocale, 'dictionary.kindFilter')}
            style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8 }}
          >
            {(['roots', 'lemmas', 'verbs'] as const).map((option) => (
              <Pressable
                key={option}
                testID={`frequency-kind-${option}`}
                // A filter chip over one list, not a pane switch -- the two
                // pills above are the tabs. Android chips are buttons that
                // carry a selected state.
                accessibilityRole="button"
                accessibilityState={{ selected: kind === option }}
                onPress={() => setKind(option)}
                style={{
                  paddingHorizontal: 14,
                  minHeight: touchTargets.minimum,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: kind === option ? theme.accent : theme.border,
                }}
              >
                <Text style={{ color: kind === option ? theme.accent : theme.mutedText }}>
                  {t(
                    uiLocale,
                    option === 'roots'
                      ? 'dictionary.kindRoots'
                      : option === 'lemmas'
                        ? 'dictionary.kindLemmas'
                        : 'dictionary.kindVerbs',
                  )}
                </Text>
              </Pressable>
            ))}
          </View>
          <FrequencyList kind={kind} />
        </>
      ) : null}
    </View>
  );
}
