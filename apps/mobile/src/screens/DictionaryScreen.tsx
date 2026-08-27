import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
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
import { GlassSurface, useGlassSkin } from '@/components/GlassSurface';
import { SegmentedControl } from '@/components/SegmentedControl';
import { getAllRootsForBrowse } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { usePressScale } from '@/motion/usePressScale';
import { useAppSettings } from '@/settings/settingsStore';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * One Material filter chip in glass, selected or not.
 *
 * Both chip rows on this screen -- Browse's sort order and the ranked pane's
 * kind -- were the same twenty lines twice, and the pair had already drifted
 * apart once (the sort row lost its toolbar label). Selection is wash AND
 * colour AND weight, never colour alone (§8, WCAG 1.4.1), plus
 * accessibilityState.selected for TalkBack, which sees none of the three.
 *
 * accessibilityRole="button", not "tab": these filter one list. The two
 * segments above are the tabs, and five tabs across two groupings is what
 * TalkBack would otherwise announce.
 */
function FilterChip({
  testID,
  label,
  selected,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useThemeColors();
  const skin = useGlassSkin();
  const press = usePressScale();

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        press.style,
        {
          paddingHorizontal: 15,
          minHeight: touchTargets.compact,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radii.pill,
          borderWidth: 1,
          // The wash replaces the glass fill rather than layering over it: its
          // measured 4.85:1 assumes it sits directly on the page.
          backgroundColor: selected ? theme.accentWash : skin.fill,
          borderColor: selected ? theme.accent : skin.border,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? theme.accent : theme.mutedText,
          fontSize: typography.caption,
          fontWeight: selected ? '700' : '500',
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

type Pane = 'browse' | 'frequent';
type DictionarySort = 'alpha' | 'freq';

const NO_ROOTS: RootSearchItem[] = [];

export function DictionaryScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
  const [pane, setPane] = useState<Pane>('browse');
  const [kind, setKind] = useState<'roots' | 'lemmas' | 'verbs'>('roots');
  // null while loading; a bare TextInput/list must not read as "no roots" for
  // the tick before the query settles.
  const [roots, setRoots] = useState<RootSearchItem[] | null>(null);
  const [rootsFailed, setRootsFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DictionarySort>('alpha');
  const [letter, setLetter] = useState<string | null>(null);

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

  // Which letters have any root at all, folded out of the list already in
  // hand rather than fetched: both came from the same 1642-row GROUP_CONCAT
  // join, so a second query paid for it twice and shipped two copies of the
  // payload over the bridge. Derived state also cannot disagree with the list
  // Browse filters -- the grid enables exactly the cells `visible` can produce,
  // because both fold with the same rootFirstLetter. Empty until the list
  // lands, so every cell renders disabled rather than flashing an all-enabled
  // alphabet that then dims.
  const available = useMemo(
    () => new Set((roots ?? NO_ROOTS).map((root) => rootFirstLetter(root.root_arabic))),
    [roots],
  );

  // One flag, one derivation: the grid is not worth the screen it takes while a
  // query is running (the results sat below the fold until the keyboard was
  // dismissed), and intersecting a query with a letter the reader can no longer
  // see filters invisibly. The letter is bypassed, not cleared, so emptying the
  // box puts the reader back where they were.
  const searching = query.trim().length > 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = roots ?? NO_ROOTS;
    if (letter && !q) list = list.filter((root) => rootFirstLetter(root.root_arabic) === letter);
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

  const paneOptions = useMemo(
    () =>
      [
        { value: 'browse', label: t(uiLocale, 'dictionary.browse') },
        { value: 'frequent', label: t(uiLocale, 'dictionary.frequent') },
      ] as const,
    [uiLocale],
  );

  return (
    <View style={{ flex: 1 }}>
      {/* No slim bar: the owner cut it on 2026-08-27, and the tab bar already
          names this screen. Its caption stayed -- it counts what is on screen,
          so it follows the letter filter and the search box rather than
          reporting a corpus total the list disagrees with -- and moved down
          onto the segmented control's own row. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 8 }}>
        <SegmentedControl
          options={paneOptions}
          value={pane}
          onChange={setPane}
          accessibilityLabel={t(uiLocale, 'tabs.dictionary')}
        />
        <Text
          testID="dictionary-count"
          numberOfLines={1}
          style={{
            alignSelf: 'flex-end',
            color: theme.mutedText,
            fontSize: typography.caption,
            // The count changes as the reader types. Proportional digits
            // reflow the line on every keystroke.
            fontVariant: ['tabular-nums'],
          }}
        >
          {pane === 'browse'
            ? // Label first, count second, the way Home's counters read. The
              // mockup's "1,642 roots" would be "1 roots" the moment a search
              // isolates one -- and "1 корней" in Russian, which is wrong for
              // three of its four count classes. No locale has to agree with a
              // number in this order, and it reuses a string that already
              // exists.
              `${t(uiLocale, 'dictionary.kindRoots')} · ${visible.length}`
            : t(uiLocale, 'dictionary.sortFreq')}
        </Text>
      </View>

      {pane === 'browse' ? (
        <>
          {/* A TextInput inside a FlatList's ListHeaderComponent loses focus on
              every keystroke -- the header element is a new instance each
              render, so the input remounts. This has to be a sibling of the
              list, not inside it. */}
          <View style={{ paddingHorizontal: 16 }}>
            {/* The glass sits on the row, not on the input, so the clear button
                reads as being inside the field. clearButtonMode is not an
                option -- it is iOS-only and this app ships Android first. */}
            <GlassSurface
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingRight: 4,
              }}
            >
              <TextInput
                testID="dictionary-search"
                value={query}
                onChangeText={setQuery}
                placeholder={t(uiLocale, 'dictionary.searchPlaceholder')}
                placeholderTextColor={theme.mutedText}
                accessibilityLabel={t(uiLocale, 'dictionary.searchLabel')}
                style={{
                  flex: 1,
                  color: theme.text,
                  paddingHorizontal: 14,
                  minHeight: touchTargets.minimum,
                }}
              />
              {query.length > 0 ? (
                <Pressable
                  testID="dictionary-search-clear"
                  accessibilityRole="button"
                  accessibilityLabel={t(uiLocale, 'dictionary.clearSearch')}
                  onPress={() => setQuery('')}
                  // A bare ✕ glyph is a ~14pt target; the minimums are what
                  // keep it above the 48dp floor the rest of the app holds to.
                  style={{
                    minHeight: touchTargets.minimum,
                    minWidth: touchTargets.minimum,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: theme.mutedText, fontSize: typography.body }}>✕</Text>
                </Pressable>
              ) : null}
            </GlassSurface>
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
                  {searching ? null : (
                    <AlphabetGrid
                      uiLocale={uiLocale}
                      available={available}
                      activeLetter={letter}
                      onSelect={(picked) => setLetter((prev) => (prev === picked ? null : picked))}
                    />
                  )}
                  <View
                    accessibilityRole="toolbar"
                    accessibilityLabel={t(uiLocale, 'dictionary.sortFilter')}
                    style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
                  >
                    {(['alpha', 'freq'] as const).map((option) => (
                      <FilterChip
                        key={option}
                        testID={`dictionary-sort-${option}`}
                        label={t(
                          uiLocale,
                          option === 'alpha' ? 'dictionary.sortAlpha' : 'dictionary.sortFreq',
                        )}
                        selected={sort === option}
                        onPress={() => setSortAndClearLetter(option)}
                      />
                    ))}
                  </View>
                </>
              }
              ListEmptyComponent={
                // getAllRootsForBrowse is a 1642-row GROUP_CONCAT join, so the
                // gap before it settles is real. `roots` is null for exactly
                // that stretch, and "No roots found" over an empty corpus reads
                // as a broken build rather than as a list on its way.
                roots === null ? (
                  <View style={{ padding: 20 }}>
                    <ActivityIndicator />
                  </View>
                ) : (
                  <View style={{ padding: 20 }}>
                    <Text testID="dictionary-empty" style={{ color: theme.mutedText }}>
                      {t(uiLocale, 'dictionary.noRootsFound')}
                    </Text>
                  </View>
                )
              }
              renderItem={({ item }) => (
                <DictionaryRow
                  uiLocale={uiLocale}
                  arabic={item.root_arabic}
                  translit={item.root_buckwalter}
                  count={item.occurrence_count}
                  href={`/root/${encodeURIComponent(item.root_buckwalter)}`}
                />
              )}
              style={{ flex: 1 }}
              // The rows carry their own side margins and the gap between
              // them, because FrequencyList renders the same card and neither
              // list should have to know the other's spacing.
              contentContainerStyle={{ paddingTop: 4, paddingBottom }}
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
              <FilterChip
                key={option}
                testID={`frequency-kind-${option}`}
                label={t(
                  uiLocale,
                  option === 'roots'
                    ? 'dictionary.kindRoots'
                    : option === 'lemmas'
                      ? 'dictionary.kindLemmas'
                      : 'dictionary.kindVerbs',
                )}
                selected={kind === option}
                onPress={() => setKind(option)}
              />
            ))}
          </View>
          <FrequencyList kind={kind} />
        </>
      ) : null}
    </View>
  );
}
